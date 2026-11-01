#!/usr/bin/env node
/**
 * telegram-report.mjs — gửi báo cáo Agent Teams qua bot Telegram hiện có.
 *
 * Vì sao có script này:
 *   - Agent Teams không có connector Telegram trong catalog MCP (đã kiểm tra: 0 kết quả).
 *   - Kênh Telegram thật của máy này là bot DSHERPbot do plugin @michengai/dsh-im-connect quản lý.
 *   - Script đọc token từ ~/.dsh/.credentials.yaml (không hard-code, không in token) và gửi
 *     thẳng qua Bot API tới chat đã allowlist.
 *
 * Cách dùng:
 *   node tools/telegram-report.mjs --text "Nội dung báo cáo"
 *   node tools/telegram-report.mjs --file bao-cao.md
 *   Get-Content bao-cao.md -Raw | node tools/telegram-report.mjs
 *
 * Cấu hình mặc định: tools/telegram-report.config.json (chat, tokenRef, credentials).
 * Thứ tự ưu tiên: tham số dòng lệnh > biến môi trường > file cấu hình > mặc định.
 *
 * Tùy chọn:
 *   --chat <id>            Chat đích (mặc định $DSH_TELEGRAM_CHAT_ID hoặc 6704329834)
 *   --token-ref <name>     Tên khóa trong credentials (mặc định im_connect_telegram_erp_token)
 *   --credentials <path>   File credentials (mặc định ~/.dsh/.credentials.yaml)
 *   --parse-mode <mode>    HTML | MarkdownV2 (mặc định gửi plain text)
 *   --silent               Gửi không thông báo
 *   --dry-run              In payload, không gửi
 *   --timeout <giây>       Timeout mỗi lần gửi (mặc định 25)
 *   --retries <n>          Số lần thử lại khi lỗi mạng/429/5xx (mặc định 3)
 *
 * Mã thoát: 0 = gửi xong, 1 = lỗi, 2 = sai tham số.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const API = 'https://api.telegram.org';
const MAX_TEXT = 4000; // giới hạn thật của Telegram là 4096; chừa biên
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(SCRIPT_DIR, 'telegram-report.config.json');

/** Đọc cấu hình mặc định của dự án; lỗi cấu hình không được làm hỏng lần gửi. */
function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch (error) {
    console.error(`Cảnh báo: không đọc được ${CONFIG_PATH}: ${error.message}`);
    return {};
  }
}

function usage(message) {
  if (message) console.error(`Lỗi: ${message}`);
  console.error('Dùng: node tools/telegram-report.mjs --text "..." | --file <path> | <stdin>');
  process.exit(2);
}

function parseArgs(argv) {
  const config = readConfig();
  const opts = {
    text: undefined,
    file: undefined,
    chat:
      process.env.DSH_TELEGRAM_CHAT_ID ||
      (typeof config.chat === 'string' && config.chat) ||
      '6704329834',
    tokenRef:
      process.env.DSH_TELEGRAM_TOKEN_REF ||
      (typeof config.tokenRef === 'string' && config.tokenRef) ||
      'im_connect_telegram_erp_token',
    credentials:
      process.env.DSH_CREDENTIALS ||
      (typeof config.credentials === 'string' && config.credentials) ||
      path.join(os.homedir(), '.dsh', '.credentials.yaml'),
    parseMode: undefined,
    silent: false,
    dryRun: false,
    timeoutSec: 25,
    retries: 3,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) usage(`thiếu giá trị cho ${arg}`);
      return v;
    };
    switch (arg) {
      case '--text': case '-t': opts.text = next(); break;
      case '--file': case '-f': opts.file = next(); break;
      case '--chat': opts.chat = next(); break;
      case '--token-ref': opts.tokenRef = next(); break;
      case '--credentials': opts.credentials = next(); break;
      case '--parse-mode': opts.parseMode = next(); break;
      case '--silent': opts.silent = true; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--timeout': opts.timeoutSec = Number(next()); break;
      case '--retries': opts.retries = Number(next()); break;
      case '--help': case '-h': usage(); break;
      default: usage(`tham số lạ: ${arg}`);
    }
  }
  if (!Number.isFinite(opts.timeoutSec) || opts.timeoutSec <= 0) usage('--timeout phải > 0');
  if (!Number.isInteger(opts.retries) || opts.retries < 0) usage('--retries phải >= 0');
  if (!opts.chat) usage('thiếu chat id');
  return opts;
}

/** Đọc một khóa vô hướng từ YAML đơn giản (không cần YAML parser đầy đủ). */
function readYamlScalar(file, key) {
  const text = fs.readFileSync(file, 'utf8');
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*${escaped}\\s*:\\s*(.+?)\\s*$`, 'm');
  const m = text.match(re);
  if (!m) return undefined;
  let value = m[1];
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

function readMessage(opts) {
  if (opts.text !== undefined) return opts.text;
  if (opts.file !== undefined) return fs.readFileSync(path.resolve(opts.file), 'utf8');
  if (!process.stdin.isTTY) return fs.readFileSync(0, 'utf8');
  usage('không có nội dung: dùng --text, --file hoặc pipe qua stdin');
}

/** Chia văn bản dài thành nhiều phần <= MAX_TEXT, ưu tiên cắt ở dòng mới. */
function chunk(text) {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= MAX_TEXT) return [normalized];
  const parts = [];
  let rest = normalized;
  while (rest.length > MAX_TEXT) {
    let cut = rest.lastIndexOf('\n', MAX_TEXT);
    if (cut < MAX_TEXT / 2) cut = MAX_TEXT;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest.length) parts.push(rest);
  return parts;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendOne(token, chat, text, opts) {
  const payload = { chat_id: chat, text };
  if (opts.parseMode) payload.parse_mode = opts.parseMode;
  if (opts.silent) payload.disable_notification = true;

  if (opts.dryRun) {
    console.log(JSON.stringify({ dryRun: true, ...payload }, null, 2));
    return { ok: true, dryRun: true };
  }

  let lastError;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(8000, 500 * 2 ** attempt));
    try {
      const res = await fetch(`${API}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(opts.timeoutSec * 1000),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) return data.result ?? { ok: true };
      const description = data.description || `HTTP ${res.status}`;
      const code = data.error_code ?? res.status;
      // 400/401/403 là lỗi cấu hình: thử lại vô ích.
      if (code >= 400 && code < 500 && code !== 429) {
        throw Object.assign(new Error(`Telegram API ${code}: ${description}`), { fatal: true });
      }
      lastError = new Error(`Telegram API ${code}: ${description}`);
    } catch (error) {
      if (error?.fatal) throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error('gửi thất bại');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const message = readMessage(opts);
  if (!message.trim()) usage('nội dung rỗng');

  if (opts.dryRun) {
    for (const part of chunk(message)) await sendOne('DRY-RUN', opts.chat, part, opts);
    return;
  }

  const token = readYamlScalar(opts.credentials, opts.tokenRef);
  if (!token) {
    throw new Error(
      `không tìm thấy khóa "${opts.tokenRef}" trong ${opts.credentials}. ` +
        'Kiểm tra lại tên tokenRef hoặc cấu hình kênh dsh-im-connect.',
    );
  }

  let lastResult;
  for (const part of chunk(message)) {
    lastResult = await sendOne(token, opts.chat, part, opts);
  }
  const messageId = lastResult?.message_id;
  console.log(
    JSON.stringify(
      {
        ok: true,
        chatId: opts.chat,
        messageId: messageId ?? null,
        parts: chunk(message).length,
      },
      null,
      0,
    ),
  );
}

main().catch((error) => {
  const detail = String(error?.message ?? error).replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot<TOKEN>');
  console.error(JSON.stringify({ ok: false, error: detail }));
  process.exit(1);
});
