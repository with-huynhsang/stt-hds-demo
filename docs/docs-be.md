# DOCS-BE: Kiến trúc & Triển khai Backend

### 1. Tư duy thiết kế (Design Philosophy)

Backend này hoạt động như một **"Tổng đài phân phối"**.

- **Main Process (FastAPI):** Chỉ lo việc nghe điện thoại (WebSocket) và ghi chép sổ sách (Database).
- **Worker Processes (AI):** Là các nhân viên chuyên môn ngồi trong phòng kín. Khi Main Process nhận audio, nó ném qua lỗ thông gió (Queue) vào phòng kín. Nhân viên xử lý xong ném giấy kết quả ra ngoài.
- **Lợi ích:** Việc AI tính toán nặng nhọc không bao giờ làm tắc nghẽn việc nhận dữ liệu từ người dùng.

### 2. Cấu trúc thư mục (Project Structure)

Chúng ta chia code theo hướng "Modular" để dễ mở rộng:

```text
backend/
├── app/
│   ├── api/
│   │   ├── endpoints.py    # WebSocket /ws/transcribe, REST /api/v1/*
│   │   └── deps.py         # Dependencies injection
│   ├── core/
│   │   ├── config.py       # Settings (Pydantic BaseSettings)
│   │   ├── database.py     # SQLite + WAL mode
│   │   ├── manager.py      # ModelManager - process lifecycle
│   │   └── errors.py       # Custom exceptions
│   ├── models/
│   │   ├── schema.py       # SQLModel definitions
│   │   └── protocols.py    # Type protocols
│   ├── workers/
│   │   ├── base.py         # BaseWorker abstract class
│   │   └── zipformer.py    # ZipformerWorker (sherpa-onnx)
│   └── __init__.py
├── main.py                 # FastAPI entry point
├── scripts/
│   └── setup_models.py     # [CRITICAL] Script tải model
├── models_storage/         # Nơi chứa file model .bin / .onnx
├── requirements.txt
└── .env
```

### 3. Workers Architecture

#### A. BaseWorker (Abstract Class)

```python
class BaseWorker:
    """Abstract base for all AI workers."""
    def __init__(self):
        self.input_queue: Queue   # Nhận audio chunks
        self.output_queue: Queue  # Gửi transcription results
    
    def run(self):
        """Main loop - override in subclass."""
        while True:
            data = self.input_queue.get()
            result = self.process(data)
            self.output_queue.put(result)
```

#### B. Worker Implementations

| Worker | Engine | Model Loading | Special Features |
|--------|--------|---------------|------------------|
| `ZipformerWorker` | `sherpa-onnx` | `OfflineRecognizer.from_transducer()` | Greedy decoding |

#### C. ModelManager

`ModelManager` quản lý lifecycle của worker processes:

```python
class ModelManager:
    def __init__(self):
        self.processes: Dict[str, Process]
        self.input_queues: Dict[str, Queue]
        self.output_queues: Dict[str, Queue]
    
    def start_worker(self, model_name: str):
        """Spawn worker process, setup queues."""
    
    def stop_worker(self, model_name: str):
        """Graceful shutdown of worker process."""
    
    def switch_model(self, from_model: str, to_model: str):
        """Hot-swap between models."""
```

### 4. API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ws/transcribe` | WebSocket | Real-time audio transcription |
| `/api/v1/models` | GET | List available models |
| `/api/v1/history` | GET | Get transcription history |
| `/api/v1/health` | GET | Health check |

### 5. Cơ sở dữ liệu (Database)

Xem chi tiết hướng dẫn cài đặt tại **[Hướng dẫn Cài đặt](setup.md)**.

Dùng **SQLModel** (SQLAlchemy + Pydantic) để định nghĩa bảng `transcriptions`.

- **Mục đích:** Lưu lại lịch sử để so sánh hiệu năng các model.
- **Async:** Sử dụng `aiosqlite` cho async database operations.
- **WAL Mode:** Bật `PRAGMA journal_mode=WAL` để tránh lỗi "Database is locked" khi ghi liên tục.

---
