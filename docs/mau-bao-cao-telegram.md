# Mẫu báo cáo Telegram — bắt buộc giữ đúng thứ tự

[AGENT-TEAMS PROJECT REPORT] — <mốc/chu kỳ> — <giờ> (<múi giờ>)

1. TÓM TẮT ĐIỀU HÀNH (3-5 dòng, không thuật ngữ thừa)
2. VIỆC ĐÃ LÀM TRONG KỲ (kèm bằng chứng: file:line hoặc output lệnh)
3. KIỂM CHỨNG (test/command thật đã chạy; PASS chỉ khi có output)
4. BẢNG TODO (ID | trạng thái | member | model | ghi chú)
5. RỦI RO / BLOCKER (kèm cách xử lý hoặc người cần quyết)
6. KẾ HOẠCH KỲ TỚI

Quy tắc: không tuyên bố PASS khi chưa chạy; không ghi "đã gửi" khi chưa có messageId; báo định kỳ dùng --silent, blocker dùng thông báo.
