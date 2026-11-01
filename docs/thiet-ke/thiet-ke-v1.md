# Thiết kế v1 — @nami/dsh-agent-teams: đổi route khi member đang chạy, thêm member thủ công, tương thích dữ liệu

Tác giả: nghien-cuu (task t2), attempt 2 (42444e37). Ngày 2026-10-31.
Đầu vào: t1 = docs/nghien-cuu/hop-dong-host.md (hợp đồng host 0.2.1-rc.5). Đầu vào code: packages/dsh-agent-teams (bản copy 0.1.28 đã đổi tên, dùng được ngay).
Skill đã nạp và dùng cho tài liệu này: contract-first (mục 2, 6 — một artifact hợp đồng duy nhất, consumer-first, compatibility rules) và api-design (mục 4 — đặt tên tool/action, mã lỗi, hình dạng response). Không dùng skill khác.

## 0. Cách đọc và quy ước

- Dòng neo dạng FILE:dòng lấy từ packages/dsh-agent-teams (không phải bản 0.1.28 trong profile desktop). Số dòng đã kiểm bằng lệnh đọc file, không suy đoán.
- Mọi ký hiệu PHẢI sửa đều có neo. Chỗ nào chưa có số dòng chính xác (khai báo union, chỗ chèn dòng) ghi rõ CẦN GREP KHI SỬA, không bịa số.
- Quy ước: I* = invariant (điều kiện bất biến), R* = quy tắc tương thích, D* = quyết định đã chốt, A* = giả định cần kiểm chứng.
- Tài liệu này KHÔNG cho phép sửa lib/state.js:648-673 sai hướng, KHÔNG cho phép sửa members.js:557 (mục 9).

## 1. Phạm vi và kết quả phải đạt

| # | Kết quả | Trạng thái hiện tại của gói | Việc phải làm |
|---|---|---|---|
| 1 | Đổi model của member ĐANG CHẠY, có hiệu lực từ lượt kế tiếp, bền qua reload/cold resume | KHÔNG có. selectionRef là biến closure trong setup (lib/members.js:612), không map theo childId; mọi cửa sửa route đều bị chặn: edit_plan update_member (lib/tools.js:573-596, throw :575-576 "staged member … was already spawned") và updatePlanBatch khi team running (lib/tools.js:565-571); HTTP /plan action=update_member (lib/index.js:339-358) đi cùng cổng. Đường DUY NHẤT hiện có là fallback tự động (lib/members.js:616-636) | tool mới + action HTTP mới + registry sống + field routeOverride bền |
| 2 | Thêm member thủ công khi team đang chạy, member sống ngay (không chờ có task) | Tool agent_teams_add_member đã chạy được khi running (lib/tools.js:1159-1262) nhưng member.id luôn rỗng (:1224) và scheduler chỉ spawn khi có ready task (lib/scheduler.js:279-285) ⇒ member mới không có task sẽ KHÔNG bao giờ có phiên | activation ngay trong add_member |
| 3 | Tương thích dữ liệu đội ERP hiện có, KHÔNG migration | readTeam giữ trường lạ (lib/state.js:740 spread; isTeamMember :648-673 không whitelist) — đã chứng minh ở t1 mục 3 | thêm key optional, không đổi key cũ, test round-trip |
| 4 | Trần cấu hình tách đôi: tự động 8, thủ công 12 | một trần duy nhất maxMembers = 8 (lib/index.js:100, :128; chặn ở lib/tools.js:1211-1212) | thêm maxManualMembers |

Ngoài phạm vi v1: UI panel đầy đủ (A2 — giai đoạn 2 sau spike), migration dữ liệu (A4), đổi cơ chế descriptor (mục 9 cấm), thay requireStagedTeam (lý do: nó bảo vệ toàn bộ plan, xem mục 4.2).

## 2. Hợp đồng dữ liệu: member JSON có routeOverride

### 2.1 Hình dạng bền (team.json → members[i])

Bốn khối route của một member, mỗi khối một ý nghĩa, KHÔNG khối nào thay khối nào:

| Field | Kiểu | Bắt buộc | Ý nghĩa | Ai ghi |
|---|---|---|---|---|
| provider, model, reasoningEffort | string (provider/model: bắt buộc non-blank khi có) | có sau khi spawn | Route PHIÊN CON ĐƯỢC MỞ VỚI (spine). Trùng với descriptor.agentProvider/agentModel | lúc spawn (lib/members.js:790-820), là bất biến sau đó — I2 |
| activeProvider, activeModel, fallbackActive | string, string, boolean | không | Route khẩn cấp do fallback tự chuyển | updateFallbackState (lib/members.js:283-286) |
| routeOverride (MỚI) | object, xem 2.2 | không | Ý định route cho các lượt TIẾP THEO, do captain/HTTP đặt | setMemberRoute (mục 4.1) |
| fallback | {provider, model} | không | Route dự phòng cấu hình sẵn | tạo member / profile |

### 2.2 routeOverride

    routeOverride?: {
      provider: string;          // non-blank, đã trim
      model: string;             // non-blank, đã trim
      reasoningEffort?: string;  // optional; vắng = dùng default của model đích; chuỗi rỗng bị loại bỏ
      source: "captain" | "http" | "profile";  // ai đặt (audit)
      at: number;                // Date.now() lúc đặt
      by?: string;               // captainSessionId (tool) hoặc "web:<sessionId>" (HTTP)
    }

Lý do có metadata: audit độc lập và nhóm log MODEL-SWITCH cần trả lời "ai đổi, khi nào, từ route nào" mà không phải suy đoán từ event (D1).

### 2.3 Thứ tự ưu tiên (một hàm duy nhất, dùng ở mọi nơi)

    routeOf(member) -> { provider, model, reasoningEffort?, origin }
    1. fallbackActive === true VÀ có activeProvider/activeModel  -> origin "fallback"   (D2)
    2. routeOverride có provider+model                          -> origin "override"
    3. activeProvider+activeModel có (không fallbackActive)     -> origin "active"
    4. provider+model có                                        -> origin "declared"
    5. ngược lại                                                -> undefined

Đúng thứ tự đã chốt (routeOverride > activeProvider > provider) cho ca thường; dòng 1 là ngoại lệ có chủ đích của D2 (xem 11.D2).

### 2.4 Invariant

- I1: routeOverride là OPTIONAL. Vắng mặt = không có ý định ghi đè; mọi hành vi rơi về như 0.1.28.
- I2: setMemberRoute TUYỆT ĐỐI không ghi provider/model/reasoningEffort của member. Ba field đó chỉ được ghi lúc spawn (thăng cấp route — 4.1 bước 8). Đây là điều kiện để descriptor guard members.js:557 vẫn đúng (mục 9).
- I3: Không đổi kiểu, không đổi tên, không xoá bất kỳ key nào đang có trong TeamMember (lib/types/types.d.ts:220-263). Chỉ thêm routeOverride sau dòng :241.
- I4: Mọi key lạ khác trong team.json tiếp tục được giữ nguyên qua read→write (lib/state.js:740 không được sửa thành whitelist).
- I5: Không migration, không backfill: plugin mới KHÔNG tự ghi routeOverride vào team.json cũ; chỉ ghi khi có lệnh đổi route.

### 2.5 Validate ở biên JSON

lib/state.js isTeamMember (:648-673) phải thêm 1 biểu thức SAU dòng :660 (sau activeModel, trước spawnError):

    && (value["routeOverride"] === undefined || (isRecord(value["routeOverride"])
        && typeof value["routeOverride"]["provider"] === "string" && value["routeOverride"]["provider"].trim() !== ""
        && typeof value["routeOverride"]["model"] === "string" && value["routeOverride"]["model"].trim() !== ""
        && isOptionalNonBlankString(value["routeOverride"]["reasoningEffort"])
        && (value["routeOverride"]["source"] === "captain" || value["routeOverride"]["source"] === "http" || value["routeOverride"]["source"] === "profile")
        && isFiniteNumber(value["routeOverride"]["at"])
        && isOptionalString(value["routeOverride"]["by"])))

Hệ quả phải chấp nhận (ghi vào log BUG nếu gặp): nếu một team.json có routeOverride sai kiểu, CẢ team không đọc được (throw lib/state.js:209 như mọi defect khác). Đây là hành vi đã có của gói, không phải mới; test bắt buộc ở 13.T3.

### 2.6 Event mới (audit)

Thêm interface vào lib/types/event-types.d.ts ngay sau AgentTeamsMemberRemovedData (:29-32):

    export interface AgentTeamsMemberRouteChangedData {
      readonly teamId: string;
      readonly memberId: string;
      readonly name: string;
      readonly provider: string;
      readonly model: string;
      readonly reasoningEffort?: string;
      readonly previous?: { readonly provider: string; readonly model: string; readonly reasoningEffort?: string };
      readonly applied: string;   // "live-and-durable" | "durable-only"
      readonly source: string;    // captain | http
    }

và thêm một dòng vào khai báo SessionEventMap cùng file (CẦN GREP "SessionEventMap" khi sửa — tệp ngắn, khai báo map nằm cuối tệp). lib/event-types.js:12 chỉ là export {} , không sửa.

Tên event: agent-teams/member-route-changed (cùng họ agent-teams/member-added dùng ở lib/tools.js:936, :1239).

## 3. Hành vi theo từng trạng thái của member

| Trạng thái | Điều kiện nhận biết | setMemberRoute làm gì | Hiệu lực khi nào | Notice model-changed |
|---|---|---|---|---|
| T0 chưa spawn | member.id === "" | ghi routeOverride + event; KHÔNG switch RAM | lần spawn kế tiếp dùng routeOf(member) | không (chưa có phiên) |
| T1 idle, child sống | member.id !== "" và selections.liveRoute(id) !== undefined | ghi routeOverride + event + setLiveRoute | lượt kế tiếp của member (khi được đánh thức bằng task/mailbox) | CÓ, do host sinh ở step kế tiếp (t1 mục 1) |
| T2 đang chạy GIỮA LƯỢT | như T1 và selectionRef.assembled !== undefined | ghi routeOverride + event + setLiveRoute CHỈ đặt .current, KHÔNG đặt .assembled | request ĐANG BAY giữ route cũ (assembled); step kế tiếp dùng route mới | CÓ ở step kế tiếp, vì sameRoute(assembled, requestHeader.config) khác nhau |
| T3 cold resume / reload plugin | plugin mới hydrate ctx.agents.list() | không làm gì (RAM trắng) | selection lấy từ team.json qua selectionFromMember → routeOverride | không, trừ khi route mới khác requestHeader cũ |

Chi tiết T2 (quan trọng, đừng làm sai): host đọc selection.current đúng MỘT lần khi step vào assembly rồi chụp vào assembled (model-selection.js:47-49). Vì vậy đặt .current là đủ và an toàn; đặt thêm .assembled sẽ đổi route của request đang bay (host chỉ làm vậy trong đường retry: lib/members.js:624, :628 vì retry lặp buildRequest trong cùng step).

Fallback sau khi đã có routeOverride (bảng D2):

| Tình huống | Route chạy lượt kế | Ghi chú |
|---|---|---|
| Có routeOverride, không fallbackActive | routeOverride | bình thường |
| Request lỗi QUOTA/RATE_LIMIT/AUTH/MISSING_CREDENTIAL/NO_ADAPTER (lib/members.js:100-110) | route fallback của member | handler :616-636 đặt current VÀ assembled, ghi activeProvider/activeModel + fallbackActive=true (:283-286) |
| Có routeOverride VÀ fallbackActive | route fallback (dòng 1 của routeOf) | routeOverride được giữ làm ý định; không bị xoá |
| Captain gọi setMemberRoute lần nữa | route mới | setMemberRoute XOÁ fallbackActive + activeProvider + activeModel (D2) |

## 4. Ký hiệu mới chính xác

### 4.1 lib/members.js (dev-runtime)

    // (a) THAY phần đầu selectionFromMember (:293-309): provider/model lấy từ routeOf thay vì
    //     (member.activeProvider ?? member.provider) như :296-297; effort giữ luật cũ (:302).
    export function routeOf(member: TeamMember): { provider: string; model: string; reasoningEffort?: string; origin: "fallback" | "override" | "active" | "declared" } | undefined

    // (b) Đăng ký selection sống theo childId. Sửa installMemberSelectionRuntime (:479-660):
    //     thêm const liveSelections = new Map() cạnh pending (:480) / pendingSetup (:481);
    //     set sau khi tạo selectionRef (:612); delete trong teardown (:637-642, TRƯỚC disposeSelection).
    export interface MemberSelectionRuntime {                       // lib/types/members.d.ts:108-113
      isPendingMember(agent: Agent): boolean;                        // đã có
      withPending<T>(...): Promise<T>;                               // đã có
      setLiveRoute(childId: string, selection: ModelSelection): boolean;   // MỚI: chỉ đặt .current
      liveRoute(childId: string): ModelSelection | undefined;        // MỚI
      liveChildIds(): readonly string[];                             // MỚI (cho status/audit)
    }

    // (c) Đọc route hiện hành để hiển thị/trả về tool.
    export function currentMemberRoute(selections: MemberSelectionRuntime, member: TeamMember)
      : { provider: string; model: string; reasoningEffort?: string; origin: "live" | "fallback" | "override" | "active" | "declared"; live: boolean }
    // luật: const live = member.id !== "" ? selections.liveRoute(member.id) : undefined;
    //       live có  -> origin "live", live: true;  ngược lại -> routeOf(member), live: false.

    // (d) Đổi route (nghiệp vụ duy nhất, gọi từ tool và HTTP).
    export async function setMemberRoute(ctx: Context, config: MemberRuntimeConfig, selections: MemberSelectionRuntime,
      captain: Agent, request: { teamId: string; memberName: string; provider: string; model: string;
        reasoningEffort?: string; source?: "captain" | "http" },   // "apply" KHÔNG phải input:
      signal?: AbortSignal): Promise<{
        member_name: string; provider: string; model: string; reasoning_effort?: string;
        previous?: { provider: string; model: string; reasoning_effort?: string };
        applied: "live-and-durable" | "durable-only"; child_id?: string; }>

Bước bắt buộc của setMemberRoute:

1. stateRoot = join(workspaceOf(captain), config.stateDir); workspace = captain.session.header.cwd ?? process.cwd() (cùng luật lib/tools.js:29-35).
2. withTeamLock("team:<stateRoot>:<teamId>", ...) — khoá cùng dạng với admission guard lib/members.js:501-513, dựng bằng teamLockKey của lib/tools.js:37 (dev-runtime tự dựng chuỗi, không import từ tools.js để khỏi vòng import).
3. Đọc fresh bằng readTeam; tìm member theo tên, bỏ qua status "removed"; throw nếu không thấy: member "<name>" is not part of team "<team>".
4. Từ chối khi member.stopping === true: member "<name>" is stopping; its route cannot be changed (G1). Cho phép khi team.halted === true nhưng KHÔNG kickMember (G2).
5. resolveMemberLlmSelection(ctx, captain, { provider, model, reasoningEffort, defaultModel: config.memberModel, defaultProvider: config.memberLlmProvider, fallback: config.fallback }, signal) — đúng đường add_member (lib/tools.js:1214-1221); rồi validateMemberLlmSelections(ctx, [selection], signal) (:1236) để route sai bị chặn TRƯỚC khi ghi.
6. previous = routeOf(member) (snapshot để trả về và ghi event).
7. Ghi bền: member.routeOverride = { provider, model, ...(reasoningEffort vắng ? {} : { reasoningEffort }), source: request.source ?? "captain", at: Date.now(), by: captain.session.id }; delete member.fallbackActive; delete member.activeProvider; delete member.activeModel; writeTeam(stateRoot, fresh).
8. Switch sống: const switched = member.id === "" ? false : selections.setLiveRoute(member.id, modelSelection(selection)); ⇒ applied = switched ? "live-and-durable" : "durable-only".
9. Thăng cấp (chỉ có tác dụng ở lần spawn): nếu member.id === "", KHÔNG thăng cấp ở đây; việc thăng cấp do spawnMember làm (mục 4.1 (e)) để mọi đường spawn đều nhất quán.
10. appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, captain.session), "agent-teams/member-route-changed", {...}) sau writeTeam (D3: đĩa trước, RAM sau — setLiveRoute ở bước 8 sau writeTeam là cố ý).
11. Trả kết quả ở dạng snake_case cho tầng tool/HTTP (lib/tools.js dùng snake_case ở output schema, xem :1245-1256).

    // (e) Thăng cấp route lúc spawn — THÊM vào spawnMember (:760-825), ngay sau khi startMember trả về
    //     và TRƯỚC khi caller writeTeam:
    member.provider = llmSelection.provider;
    member.model = llmSelection.model;
    if (llmSelection.reasoningEffort === undefined) delete member.reasoningEffort;
    else member.reasoningEffort = llmSelection.reasoningEffort;
    delete member.routeOverride;
    // Lý do: descriptor ghi agentProvider/agentModel = route dùng để mở phiên (dsh-subagent/lib/index.js:1398-1411),
    // nên spine phải bằng route đó, nếu không lần cold resume sau sẽ nổ members.js:557 (mục 9).

    // (f) Spawn ngay một member đã có trong roster mà chưa có phiên (dùng cho add_member thủ công).
    export async function activateMemberNow(ctx: Context, config: MemberRuntimeConfig, selections: MemberSelectionRuntime,
      captain: Agent, team: TeamState, member: TeamMember, toolFilter: MemberToolFilter | undefined,
      initialPrompt: string, signal?: AbortSignal): Promise<{ childId: string }>
    // Thân hàm = khuôn đã chạy đúng ở lib/tools.js:521-541:
    //   const route = routeOf(member); const selection = await resolveMemberLlmSelection(ctx, captain,
    //     { provider: route?.provider, model: route?.model, reasoningEffort: route?.reasoningEffort, fallback: member.fallback }, signal);
    //   await spawnMember(ctx, config, selections, selection, captain, team, member, config.stateDir, signal, initialPrompt, toolFilter, undefined);
    //   delete member.spawnError; return { childId: member.id };
    // Người gọi chịu trách nhiệm writeTeam + dọn orphan (khuôn :536-547).

### 4.2 lib/tools.js (dev-tools)

    // (a) Tool mới, chèn NGAY TRƯỚC khối ctx.tools.register của remove_member (:1263).
    ctx.tools.register(defineTool({
      name: "agent_teams_set_member_route",
      description: "Change the model route of a member that already exists, including while it is running. " +
        "The next step uses the new route; the step already in flight keeps the route it started with and the " +
        "session records a model-changed notice. Works for a member that was never spawned (the route is used " +
        "when it starts) and for one running now (team.json keeps the spawn route; the override is separate).",
      parameters: z.object({ member_name: z.string().required(), provider: z.string().required(),
        model: z.string().required(), reasoning_effort: z.string() }),
      output: z.object({ member_name: z.string(), provider: z.string(), model: z.string(),
        reasoning_effort: z.string().optional(), previous_provider: z.string().optional(),
        previous_model: z.string().optional(), applied: z.string().required(), child_id: z.string().optional() }),
      async execute(args, exec) {
        const captain = requireCaptain(exec);                       // khuôn :1195
        const team = await requireCaptainTeam(ctx, workspaceOf(captain), config, captain);   // :1198
        const result = await runtime.setMemberRoute(captain, { teamId: team.id, memberName: args.member_name,
          provider: args.provider, model: args.model, reasoningEffort: trimmedOptional(args.reasoning_effort),
          source: "captain" }, exec.signal);
        return { ...snake_case(result) };
      } }));

    // (b) Tên tool vào danh sách: lib/tool-names.js:2-8 TEAM_TOOL_NAMES thêm "agent_teams_set_member_route".
    //     :12 CAPTAIN_TOOL_NAMES tự tính lại ⇒ tool thành captain-only, và tự vào BUILTIN_DENY_TOOLS
    //     (lib/tool-policies.js:38) ⇒ member không bao giờ gọi được. Không cần sửa tool-policies.js.

    // (c) runtime facade (:2403-2411) thêm 3 khả năng, chữ ký đóng trên ctx/config/memberSelections:
    setMemberRoute: (captain, request, signal) => setMemberRoute(ctx, config, memberSelections, captain, request, signal),
    addMember: (captain, request, signal) => addMemberNow(ctx, config, memberSelections, captain, request, signal),
    currentMemberRoute: (member) => currentMemberRoute(memberSelections, member),
    // memberSelections đã có sẵn ở :2402 — không tạo thêm registry thứ hai.

    // (d) add_member (:1159-1262) sửa 4 điểm:
    //   d1. trần: :1211-1212 đổi config.maxMembers -> config.maxManualMembers, thông điệp:
    //       team "<n>" is at its manual member cap (<maxManualMembers>).
    //   d2. tham số mới: activation = z.enum(["immediate","on-task"]).default("immediate") trong :1162-1170.
    //   d3. sau writeTeam/appendTeamEvent (:1238-1244), khi activation === "immediate" và fresh.phase !== "staged":
    //       await activateMemberNow(ctx, memberRuntime(config), memberSelections, captain, fresh, member,
    //         member.toolFilter, memberWelcome(fresh, member.name)); rồi writeTeam(stateRoot, fresh) lần nữa
    //       (member.id vừa được đặt) và appendTeamEvent "agent-teams/member-spawned" nếu muốn audit tách dòng.
    //   d4. output (:1245-1256) thêm spawned: boolean và phase; giữ nguyên các key cũ.
    //   Ghi chú: memberRuntime là helper cục bộ của tools.js (:2657-2658) nên activateMemberNow nhận MemberRuntimeConfig.

    // (e) Status projection (:2181-2193) thêm 5 key, KHÔNG bỏ key nào:
    //     active_provider, active_model, fallback_active, route_override: {provider, model, reasoning_effort?, source, at},
    //     next_route: "<provider>/<model>"  (từ runtime.currentMemberRoute).

    // (f) renderStatus (:2667-2719) dòng member (:2684) đổi thành 2 vế, xem mục 7.

### 4.3 lib/index.js (dev-tools)

    // (a) Config schema: sau :100 thêm
    maxManualMembers: z.natural().min(1).default(12),
    // và trong resolved (:120-133) sau :128 thêm maxManualMembers: config.maxManualMembers ?? 12;
    // rồi validate ngay sau khi dựng resolved (:133), TRƯỚC registerAgentTeamsTools (:139):
    if (resolved.maxManualMembers < resolved.maxMembers) throw new Error(
      "agent-teams: maxManualMembers (" + resolved.maxManualMembers + ") must be >= maxMembers (" + resolved.maxMembers + ")");   // D5

    // (b) Route /plan (:262-408): thêm một action, KHÔNG tạo route mới (A2 — client sau này gọi cùng route).
    //   b1. Nhánh mới chèn ngay SAU khối update_member (:339-358) và TRƯỚC update_task (:359):
    //       if (action === "set_member_route") {
    //         // bắt buộc memberName + provider + model là string non-blank, cùng kiểu kiểm ở :339-358
    //         const result = await agentTeamsRuntime.setMemberRoute(captain, { teamId, memberName, provider, model,
    //           reasoningEffort, source: "http" }, undefined);
    //         return sendJson(res, 200, result);   // dùng đúng helper mà nhánh :400-401 đang dùng
    //       }
    //   b2. Không đưa action này vào mutation của updateStagedPlan (:399) — nó không phải sửa plan.
    //   b3. Vì vậy "unknown plan action" (:396-397) không đổi.
    //   b4. /state (:182-184) KHÔNG sửa: nó trả snapshot, mà snapshot đã có route mới sau 4.4.

### 4.4 lib/snapshot.js (dev-runtime, xem D6)

    // members projection (:61-88) THÊM, không đổi key cũ (:68-70 provider/model/reasoningEffort giữ nguyên nghĩa "route mở phiên"):
    activeProvider, activeModel, fallbackActive, routeOverride, nextRoute: string, routeOrigin: string
    // nextRoute/routeOrigin tính bằng routeOf(member) (rẻ, thuần).

### 4.5 lib/client.js + lib/locales.js (dev-ui, giai đoạn 2)

    // Chỉ đọc key mới trong snapshot; không đổi key cũ (:835-838 vẫn dùng provider/model cho route mở phiên).
    // Thêm locale key: team.member.route.spine, team.member.route.next, team.member.route.override,
    // team.member.route.fallback  (đặt cạnh plan.model.route :2336 zh / :2555 en).

## 5. Danh sách thay đổi TỪNG FILE kèm dòng neo và người sở hữu

| File | Neo | Thay đổi | Owner |
|---|---|---|---|
| lib/types/types.d.ts | chèn sau :241 | thêm routeOverride?: TeamRouteOverride vào TeamMember (:220-263) + interface mới cùng file | dev-runtime |
| lib/state.js | :648-673 (chèn sau :660) | validate routeOverride trong isTeamMember | dev-runtime |
| lib/state.js | :702-742 (:740) | KHÔNG sửa; chỉ thêm test khẳng định spread giữ key lạ | dev-runtime |
| lib/members.js | :293-309 | selectionFromMember dùng routeOf | dev-runtime |
| lib/members.js | :479-660 (:480, :481, :612, :637-642, :644-660) | Map liveSelections + 3 method registry | dev-runtime |
| lib/members.js | :760-825 | thăng cấp route sau spawn (4.1 e) | dev-runtime |
| lib/members.js | mới sau :825 | routeOf, currentMemberRoute, setMemberRoute, activateMemberNow | dev-runtime |
| lib/types/members.d.ts | :108-113, :219-227, :266 | khai báo method/ký hiệu mới | dev-runtime |
| lib/types/event-types.d.ts | sau :32 + map cuối tệp | AgentTeamsMemberRouteChangedData | dev-runtime |
| lib/snapshot.js | :61-88 | thêm 6 key route (D6) | dev-runtime |
| lib/tool-names.js | :2-8 | thêm agent_teams_set_member_route | dev-tools |
| lib/tools.js | :1159-1262 (:1162-1170, :1211-1212, :1238-1244, :1245-1256) | add_member: trần tay, activation ngay | dev-tools |
| lib/tools.js | chèn trước :1263 | tool agent_teams_set_member_route | dev-tools |
| lib/tools.js | :2181-2193 | status projection thêm 5 key | dev-tools |
| lib/tools.js | :2403-2411 | runtime facade thêm 3 khả năng | dev-tools |
| lib/tools.js | :2667-2719 (:2684) | renderStatus hai vế | dev-tools |
| lib/tools.js | :557-663 | KHÔNG sửa (requireStagedTeam giữ nguyên — lý do 4.2) | dev-tools |
| lib/index.js | :100, :120-133, :139 | maxManualMembers + validate D5 | dev-tools |
| lib/index.js | :339-358 (chèn sau), :396-401 | action set_member_route | dev-tools |
| lib/types/tools.d.ts, lib/types/index.d.ts | theo file .js tương ứng | khai báo mới | dev-tools |
| lib/client.js | :835-838, :112-113 | hiển thị hai route (giai đoạn 2) | dev-ui |
| lib/locales.js | cạnh :2336 / :2555 | 4 locale key | dev-ui |
| tests/, tools/test/ | mới | 11 ca ở mục 13 | kiem-thu |

Không sửa: lib/web-routes.js (:9, :62-81 — HTTP đi qua /plan), lib/profiles.js (:180-195 giữ trần maxMembers cho roster khai báo), lib/tool-policies.js, lib/scheduler.js (:279-285 giữ nguyên; add_member dùng activateMemberNow thay vì móc vào scheduler), lib/harness-compat.js, build/**.

## 6. Tương thích ngược (không migration)

Bốn chiều đọc/ghi phải đúng:

| Dữ liệu | Người đọc | Hành vi bắt buộc | Căn cứ |
|---|---|---|---|
| team.json CŨ (không routeOverride) | plugin MỚI | đọc được, routeOf rơi về declared; KHÔNG ghi thêm gì vào đĩa | isTeamMember optional (2.5), I5 |
| team.json MỚI (có routeOverride) | plugin CŨ 0.1.28 | đọc được, bỏ qua routeOverride, member chạy route provider/model | lib/state.js:740 spread; isTeamMember không whitelist |
| team.json MỚI | plugin MỚI | override có hiệu lực | mục 3 |
| snapshot MỚI | client CŨ | chỉ thấy key quen, hiển thị 1 route | mục 4.4 chỉ thêm key |

Quy tắc:

- R1: không đổi tên/kiểu/xoá key cũ của TeamMember hay của snapshot member.
- R2: routeOverride là optional; hành vi khi vắng = hành vi 0.1.28.
- R3: giữ nguyên spread ở lib/state.js:740. Cấm biến coerceTeamState thành whitelist (sẽ phá dữ liệu ERP).
- R4: không backfill. Bản mới không tự thêm routeOverride vào team.json cũ, cũng không tự xoá trường lạ.
- R5: hạ cấp (downgrade) làm mất hiệu lực override nhưng KHÔNG làm hỏng file; chấp nhận và ghi vào docs/log/BUG.md nếu vận hành gặp.
- R6: không đổi đường ghi team.json (writeTeam :251-253) để mọi test round-trip cũ vẫn đúng.

Kiểm chứng bắt buộc (không dùng dữ liệu đội erp-erp thật, chỉ copy sang scratch): đọc một team.json cũ → write → đọc lại, so sánh từng byte ngoài các field được phép đổi (13.T3).

## 7. Quy tắc hiển thị HAI route (panel + status)

Bốn quy tắc, áp cho renderStatus (lib/tools.js:2684) và snapshot (lib/snapshot.js:68-70):

1. Luôn hiển thị route SPINE trước: "<provider>/<model>" từ member.provider/member.model. Đây là route phiên con được mở với; nó là thứ descriptor ghi và là thứ guard :557 so.
2. Route KẾ TIẾP chỉ hiển thị khi KHÁC spine: "<spine> → <next>", vàng/thẻ riêng. Nếu trùng, chỉ in một route (không in mũi tên vô nghĩa).
3. Nhãn nguồn của route kế tiếp theo origin: override = "đổi bởi captain lúc HH:MM"; fallback = "fallback đang bật"; active = "route khẩn cấp"; declared = không nhãn.
4. Không bao giờ ẩn fallbackActive: nếu fallbackActive === true, in thêm nhãn "fallback" kể cả khi route kế tiếp trùng spine.

Chuỗi cho renderStatus (dev-tools, thay :2684):

    const spine = member.provider && member.model ? " · " + member.provider + "/" + member.model : "";
    const next = runtime.currentMemberRoute(member);
    const differ = next !== undefined && next.provider + "/" + next.model !== (member.provider ?? "") + "/" + (member.model ?? "");
    const tail = differ ? " → " + next.provider + "/" + next.model + (next.origin === "override" ? " (override)" : next.origin === "fallback" ? " (fallback)" : "") : "";
    // route = spine + tail, giữ nguyên phần effort (:2685) và policy (:2687).

Giai đoạn 2 (dev-ui) chỉ thay phần render thẻ member (lib/client.js:835-838) bằng cùng luật; locale key ở 4.5. Trong giai đoạn 1, tool status đã trả đủ 5 key nên vẫn quan sát được mà không cần UI.

## 8. Trần cấu hình (A3)

| Trần | Tên | Mặc định | Áp cho | Neo |
|---|---|---|---|---|
| Roster tự động/khai báo | maxMembers | 8 | create(plan), profile, validateStagedGraph, normalizeListedProfile | lib/index.js:100, :128; lib/tools.js:565-663; lib/profiles.js:180-195 |
| Thêm tay | maxManualMembers (MỚI) | 12 | agent_teams_add_member (và action add_member nếu sau này mở cho chạy) | lib/tools.js:1211-1212 |

Bất biến: maxManualMembers >= maxMembers (D5, throw ở mount lib/index.js:133). Đếm member: mọi member có status !== "removed" (giữ nguyên cách đếm hiện tại ở :1211). Thông điệp lỗi phải nêu con số và tên trần (mục 4.2 d1).

## 9. Descriptor guard: KHẲNG ĐỊNH KHÔNG SỬA

Nguyên văn guard hiện tại (lib/members.js:550-560, câu throw ở :557):

    let selection = pending.get(key);
    if (selection === undefined) {
      const team = readTeamSync(stateRoot, teamId);
      if (team?.captainSessionId !== parentSessionId) return cleanupAdmission;
      const durableMember = team.members.find((m) => m.name === memberName);
      selection = selectionFromMember(durableMember);
      if (selection !== undefined && (descriptor.agentProvider !== durableMember?.provider || descriptor.agentModel !== durableMember?.model))
        throw new Error("agent-teams: saved model route for member \"" + memberName + "\" does not match its subagent descriptor");
    }

Kết luận thiết kế: KHÔNG sửa dòng :557, không nới điều kiện, không bọc try/catch, không thay bằng so sánh routeOf.
Chứng minh thiết kế này tự thoả guard:

- Guard so descriptor.agentProvider/agentModel với durableMember.provider/model — tức so với SPINE, không so với route hiện hành.
- setMemberRoute không ghi provider/model (I2) ⇒ spine vẫn bằng descriptor ⇒ guard pass sau reload và sau cold resume.
- selectionFromMember được đổi để trả route của routeOf (override) — guard chỉ dùng selection để so với đường khác, không dùng nó để so descriptor, nên đổi :293-309 KHÔNG đụng :557.
- Lúc spawn, spine được thăng cấp thành đúng route đã dùng để mở phiên (4.1 e) ⇒ descriptor luôn khớp spine ngay cả khi member được spawn từ một routeOverride.

Cấm tường minh (nếu ai làm, phải mở lại thiết kế): (a) sửa :557 hoặc điều kiện của nó; (b) sửa lib/../dsh-subagent descriptor/foldSubagentDescriptor; (c) ghi thêm event subagent/descriptor (fold lấy event ĐẦU TIÊN nên vô nghĩa); (d) đồng bộ provider/model = route mới khi đổi route; (e) xoá routeOverride mà không ghi spine.

## 10. Giả định A1-A4 và cách kiểm chứng

| # | Giả định | Cách kiểm chứng (phải chạy thật) | Người chạy | Nếu sai thì làm gì |
|---|---|---|---|---|
| A1 | Tên gói @nami/dsh-agent-teams cài được vào profile nháp trước khi dev viết code | dsh.cmd plugin --profile <nháp> add <đường dẫn packages/dsh-agent-teams> ; rồi dsh.cmd --profile <nháp> --dump-config > d.yml ; grep -n "id: agent-teams" d.yml VÀ đọc stderr (t1 đã chứng minh exit 0 vẫn có thể skip bundle) | kiem-thu, trước khi dev-runtime merge | nếu pnpm/peerDeps chặn: dùng đường --patch overlay đã chứng minh chạy ở t1, hoặc đổi dsh.bundle trong package.json; KHÔNG đổi tên gói |
| A2 | Giai đoạn 1 chỉ tool + HTTP; UI giai đoạn 2 sau spike | demo: gọi agent_teams_set_member_route trên member đang chạy, và POST /plugins/dsh-agent-teams/plan {action:"set_member_route"}; xác nhận request kế tiếp dùng model mới | kiem-thu | nếu cần UI ngay: dev-ui làm song song nhưng KHÔNG chặn 3 dev khác; UI chỉ đọc key mới của snapshot |
| A3 | Trần tự động 8, trần tay 12 | unit/integration: add_member lần 9 với roster tự động → throw; add_member lần 13 bằng tay → throw; 12 member thủ công vẫn chạy | kiem-thu | nếu cần >12: chỉ đổi default maxManualMembers, không đổi code |
| A4 | Không migration dữ liệu | copy một team.json cũ (kể cả đội ERP) sang state root NHÁP rồi readTeam + write + read, so sánh; đã có tiền lệ thí nghiệm ở t1 mục 3 | kiem-thu + audit | nếu gặp file có key sai kiểu: KHÔNG nới validate; ghi BUG và xử lý bằng sửa dữ liệu có kiểm soát (ngoài phạm vi v1) |

## 11. Quyết định đã chốt

- D1: routeOverride là object có metadata (source/at/by) chứ không phải 2 string rời. Lý do: audit độc lập + log MODEL-SWITCH cần ai/khi nào. Lật ngược nếu: kích thước team.json thành vấn đề (không thực tế).
- D2: khi fallbackActive === true, route fallback THẮNG routeOverride trong lúc fallback đang bật. Lý do: nếu override thắng tuyệt đối, sau khi captain đổi route thì fallback không bao giờ chạy được nữa ⇒ mất cơ chế tự cứu. setMemberRoute xoá fallbackActive để override mới có hiệu lực ngay. Lật ngược nếu: user muốn override tuyệt đối — khi đó bỏ dòng 1 của routeOf và bỏ phần delete active* trong 4.1 bước 7.
- D3: ghi team.json TRƯỚC, switch RAM SAU. Lý do: đĩa là nguồn chân lý sau reload; RAM trễ một nhịp vô hại. Lật ngược nếu: cần tuyệt đối không có lượt nào chạy route cũ sau khi lệnh trả về — khi đó đảo thứ tự và thêm rollback.
- D4: không đụng provider/model khi đổi route (I2). Lý do: descriptor guard :557 và panel cần phân biệt spine vs route kế tiếp.
- D5: maxManualMembers >= maxMembers bắt buộc, throw ở mount. Lý do: cấu hình ngược gây thông điệp trần khó hiểu.
- D6: gán lib/snapshot.js, lib/events.js, lib/event-types.js (và .d.ts tương ứng, lib/types/types.d.ts) cho dev-runtime. Lý do: docs/ke-hoach-staged.md hiện KHÔNG gán các file này, nhưng v1 bắt buộc chạm snapshot.js (panel) và event-types.d.ts (event mới); để trống thì 3 dev sẽ giẫm nhau. CẦN CAPTAIN XÁC NHẬN trước khi dev-runtime bắt đầu — nếu captain chọn khác, phải gán tường minh chứ không để mặc định.

## 12. Rủi ro và câu hỏi mở

- G1: member.stopping === true — setMemberRoute từ chối (4.1 bước 4).
- G2: team.halted === true — cho phép đổi route, nhưng không kickMember (halt nghĩa là dừng công việc, không phải cấm sửa cấu hình).
- G3: member legacy không có route bền (members.js:610-611 trả sớm khi selection undefined) KHÔNG nhận installModelSelection ⇒ setMemberRoute chỉ trả applied="durable-only". Chấp nhận: bản mới luôn ghi route lúc spawn nên không sinh thêm member legacy. KHÔNG sửa :610-611 trong v1.
- G4: race reload đúng lúc switch — liveSelections có thể giữ ref đã chết trong khoảnh khắc; teardown (:637-642) xoá, setLiveRoute trả false ⇒ applied="durable-only". Không nổ.
- G5: hai lần đổi route trong cùng một step chỉ sinh một notice (host so assembled với requestHeader) — chấp nhận, không phải lỗi.
- G6: routeOverride trên member đã bị remove (status "removed") — setMemberRoute từ chối (bước 3), dữ liệu cũ vẫn nằm trong file (R4, không dọn).
- Câu hỏi mở 1: D6 cần captain xác nhận (chặn dev-runtime).
- Câu hỏi mở 2: audit độc lập đọc event agent-teams/member-route-changed từ đâu (log file hay session event)? Nếu cần file log riêng trong docs/log/MODEL-SWITCH.md thì dev-runtime phải ghi thêm ở bước 10 — chờ captain chốt.
- Câu hỏi mở 3: tên tool agent_teams_set_member_route (đề xuất) vs agent_teams_set_route; tài liệu này chốt set_member_route vì team có thể có nhiều member.

## 13. Kiểm thử tối thiểu (đầu vào cho kiem-thu)

| # | Ca | Kỳ vọng |
|---|---|---|
| T1 | routeOf với 5 tổ hợp (không gì; chỉ provider/model; +active khi fallbackActive; +override; +override&fallbackActive) | đúng bảng 2.3 |
| T2 | selectionFromMember với override | trả đúng provider/model/effort của override; effort bị bỏ khi origin fallback |
| T3 | round-trip team.json cũ + trường lạ (erpExtension nested) | file sau write vẫn giữ nguyên trường lạ, không thêm routeOverride |
| T4 | isTeamMember với routeOverride thiếu model | readTeam throw invalid AgentTeams state (chấp nhận, ghi rõ) |
| T5 | setMemberRoute khi member.id === "" | applied="durable-only", team.json có routeOverride, không có child |
| T6 | setMemberRoute khi member đang chạy | applied="live-and-durable"; request kế tiếp dùng model mới; request đang bay giữ route cũ; có notice "[model changed: ...]" |
| T7 | reload plugin rồi cold resume member đã override | route override vẫn có hiệu lực; KHÔNG ném "saved model route ... does not match its subagent descriptor" |
| T8 | add_member 9 (tự động) và 13 (tay) | throw đúng thông điệp trần |
| T9 | add_member activation=immediate khi team running, không có task | member.id khác rỗng ngay; member sống (gửi message được) |
| T10 | HTTP POST /plan action=set_member_route | 200 + kết quả; session không phải captain → 409 như :403-406 |
| T11 | diff lib/members.js | dòng :557 (câu throw descriptor) KHÔNG đổi — kiểm bằng git diff/So sánh chuỗi |

## 14. Phụ lục — lệnh tái lập bằng chứng

- Đọc neo: grep -n "selectionFromMember" packages/dsh-agent-teams/lib/members.js
- Kiểm guard không đổi: grep -n "does not match its subagent descriptor" packages/dsh-agent-teams/lib/members.js  (kỳ vọng đúng 1 dòng, số dòng không đổi so với trước khi sửa)
- Kiểm không whitelist hoá: grep -n "const coerced = { ...value, tasks }" packages/dsh-agent-teams/lib/state.js
- Kiểm tool captain-only: grep -n "CAPTAIN_TOOL_NAMES" packages/dsh-agent-teams/lib/tool-names.js packages/dsh-agent-teams/lib/tool-policies.js
