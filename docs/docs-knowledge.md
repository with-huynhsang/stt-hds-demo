# DOCS-KNOWLEDGE: Real-time Speech-to-Text (STT)

### 1. Kiến trúc Model (Architectures)

Hiểu rõ sự khác biệt cốt lõi để xây dựng luồng xử lý (pipeline) phù hợp.

- **Transducer (RNN-T) / Streaming Native:**

  - **Đại diện:** Zipformer.
  - **Cơ chế:** Xử lý từng khung (frame) âm thanh nhỏ (ví dụ: 40-80ms) và dự đoán ký tự ngay lập tức. Không cần ngữ cảnh tương lai.
  - **Đặc điểm:** Output text xuất hiện liên tục, độ trễ cực thấp (Real-time đúng nghĩa).
  - **Yêu cầu hệ thống:** Cần stateful worker (giữ trạng thái câu nói).

### 2. Chỉ số đo lường (Metrics)

Các tiêu chí định lượng dùng để so sánh 3 models trong bài nghiên cứu.

- **Latency (Độ trễ):** Thời gian tính từ lúc người dùng dứt lời (hoặc gửi chunk cuối cùng) đến khi ký tự cuối cùng hiện lên màn hình.
  - _Target:_ < 1.5s (End-to-end).
- **WER (Word Error Rate):** Tỷ lệ lỗi từ. Công thức: `(Thêm + Sửa + Xóa) / Tổng số từ`. Càng thấp càng tốt.
- **RTF (Real Time Factor):** Tỷ lệ `Thời gian xử lý / Thời lượng âm thanh`.
  - _Ví dụ:_ Audio 10s, xử lý mất 1s => RTF = 0.1.
  - _Yêu cầu:_ RTF phải < 1.0 để đảm bảo Real-time.

### 3. Tiêu chuẩn Dữ liệu (Data Standards)

Quy chuẩn input audio bắt buộc cho mọi model để đảm bảo tính nhất quán.

- **Sample Rate:** 16000 Hz (16kHz).
- **Channels:** Mono (1 channel).
- **Format:** PCM (Pulse Code Modulation).
  - **Frontend Capture:** Float32 (Web Audio API standard).
  - **Backend Input:** Float32 hoặc Int16 (Tùy thư viện model yêu cầu, cần convert).
- **Transport:** Binary Stream (qua WebSocket). Không dùng Base64 để tránh overhead 33%.

### 4. Thuật ngữ & Công nghệ (Tech Glossary)

- **VAD (Voice Activity Detection):** Kỹ thuật phát hiện tiếng nói con người. Dùng để loại bỏ khoảng lặng (silence) và xác định thời điểm ngắt câu.
  - _Energy-based VAD:_ Đơn giản, dựa trên RMS energy threshold.
- **Quantization (Lượng tử hóa):** Kỹ thuật giảm độ chính xác của trọng số model (từ float32 xuống int8) để giảm dung lượng RAM và tăng tốc độ inference mà ít ảnh hưởng đến độ chính xác.
- **AudioWorklet:** API của trình duyệt chạy trên luồng riêng (khác Main Thread), dùng để capture và xử lý audio raw thời gian thực mà không bị giật lag UI.
- **Inference Engine:**
  - _Sherpa-onnx:_ Engine tối ưu cho Transducer models (Zipformer). Hỗ trợ streaming & offline.
- **RNN-Transducer (RNN-T):** Architecture kết hợp encoder (audio features) + prediction network (text context) + joint network. Hỗ trợ streaming inference.

---
