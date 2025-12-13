# DOCS-SOLUTIONS: Core Logic & System Algorithms

### 1\. Processing Strategy (Chiến lược xử lý)

#### Streaming Transcription (Zipformer)

- **Nguyên lý:** Real-time streaming với incremental results.
- **Logic Flow:**
  1.  Nhận Audio Chunk từ WebSocket.
  2.  Buffer audio và feed vào `sherpa-onnx.OfflineRecognizer`.
  3.  Trả về kết quả transcription ngay lập tức.
  4.  Gửi `is_final: false` cho interim results, `is_final: true` khi flush.

**Key Characteristics:**
- Low latency (< 500ms)
- Continuous transcription updates
- Text contains full transcription (replace strategy)

---

### 2\. Audio Pipeline Solution (Giải pháp đường ống âm thanh)

#### A. Frontend Pre-processing (Tại Client)

Giảm tải cho Server bằng cách xử lý sơ bộ tại nguồn.

- **AudioWorklet:** Sử dụng Worklet Node để chặn luồng audio `float32` từ microphone.
- **Downsampling:** Thực hiện thuật toán Decimation đơn giản để hạ sample rate từ 44.1/48kHz xuống **16kHz**.
- **Format Conversion:** Convert `Float32` (-1.0 đến 1.0) sang `Int16` PCM (đây là định dạng chuẩn nhất để gửi qua socket, tiết kiệm 50% băng thông so với Float32).

#### B. Protocol Standardization (Giao thức)

Sử dụng giao thức WebSocket với 2 loại bản tin:

1.  **Config Message (JSON - Gửi lần đầu):**
    ```json
    { "type": "config", "model": "zipformer", "sample_rate": 16000 }
    ```
2.  **Data Message (Binary):** Raw PCM bytes (không bọc JSON, không Base64).

---

### 3\. Latency Optimization Techniques (Kỹ thuật giảm trễ)

Để đảm bảo phản hồi \< 500ms, áp dụng các kỹ thuật sau:

1.  **Multiprocessing Queue:**

    - Thay vì dùng `threading` (bị giới hạn bởi Python GIL), sử dụng `multiprocessing`. Mỗi Model Worker là một Process hệ điều hành riêng biệt.
    - Giao tiếp giữa WebSocket Process và AI Process qua `multiprocessing.Queue`.

2.  **Result Deduplication:**

    - Zipformer is streaming model, sends updates frequently.
    - Only send result to client when text actually changes.
    - Prevents flooding client with duplicate results.

3.  **Keep-Alive Model:**

    - Model Zipformer load rất nhanh (~1-2s).
    - Model được giữ trong memory sau khi load.
    - Subsequent requests don't need to reload model.

---

### 4\. Client-Side Rendering Logic (Giải pháp hiển thị FE)

Để trải nghiệm người dùng mượt mà:

- **Text Buffer Management:** Frontend duy trì một mảng `transcript_segments`.
- **Handling Updates:**
  - Nếu nhận `is_final: false` $\rightarrow$ Cập nhật phần tử cuối cùng của mảng (hiệu ứng text đang nhảy).
  - Nếu nhận `is_final: true` $\rightarrow$ Chốt phần tử cuối, tạo phần tử rỗng mới để chờ câu tiếp theo.
- **Visual Feedback:** Hiển thị text đang nhận diện (interim) bằng màu xám, text đã chốt (final) bằng màu đen.

---
