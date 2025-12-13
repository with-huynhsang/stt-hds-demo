# Hướng dẫn Cài đặt Dự án

Tài liệu này hướng dẫn cài đặt cho cả Backend và Frontend, hỗ trợ môi trường **Local Development** và **Docker**.

## Yêu cầu tiên quyết (Prerequisites)

- **Git**
- **Docker & Docker Compose** (Khuyên dùng)
- **Python 3.10+** (Cho local backend)
- **Node.js 18+ / Bun 1.0+** (Cho local frontend)

---

## 1. Khởi động nhanh (Docker)

Cách dễ nhất để chạy toàn bộ hệ thống.

1.  **Clone repository:**

    ```bash
    git clone <repo-url>
    cd voice2text-vietnamese
    ```

2.  **Cài đặt Models (Bước quan trọng):**
    Trước khi khởi động containers, bạn phải tải các models về.

    ```bash
    # Linux/Mac
    python3 backend/scripts/setup_models.py

    # Windows
    python backend/scripts/setup_models.py
    ```

3.  **Khởi động Services:**

    ```bash
    docker-compose up --build
    ```

4.  **Truy cập:**
    - Frontend: `http://localhost:5173`
    - Backend API: `http://localhost:8000/docs`

---

## 2. Cài đặt Local (Local Development)

### Backend (FastAPI)

1.  **Di chuyển vào thư mục backend:**

    ```bash
    cd backend
    ```

2.  **Tạo môi trường ảo (Virtual Environment):**

    ```bash
    python -m venv venv
    # Kích hoạt (Activate)
    # Windows:
    .\venv\Scripts\activate
    # Linux/Mac:
    source venv/bin/activate
    ```

3.  **Cài đặt thư viện (Dependencies):**

    ```bash
    pip install -r requirements.txt
    ```

4.  **Cài đặt Models:**

    ```bash
    python scripts/setup_models.py
    ```

5.  **Chạy Server:**
    ```bash
    python main.py
    # Hoặc chạy trực tiếp với uvicorn:
    # uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
    ```

### Frontend (React + Vite)

1.  **Di chuyển vào thư mục frontend:**

    ```bash
    cd frontend
    ```

2.  **Cài đặt thư viện:**

    ```bash
    bun install
    # hoặc npm install
    ```

3.  **Chạy Dev Server:**

    ```bash
    bun dev
    # hoặc npm run dev
    ```

4.  **Đồng bộ API Types (Tùy chọn):**
    Nếu bạn thay đổi code Backend, hãy regenerate client:
    ```bash
    bun run gen:api
    ```

---

## 3. Khắc phục sự cố (Troubleshooting)

- **Models not found:** Đảm bảo bạn đã chạy `setup_models.py` và thư mục `backend/models_storage` đã có dữ liệu.
- **Port conflicts:** Kiểm tra xem cổng 8000 hoặc 5173 có đang bị chiếm dụng không.
- **AudioWorklet Error:** Đảm bảo bạn đang dùng `localhost` hoặc `https`. Trình duyệt chặn AudioContext trên `http` không an toàn (ngoại trừ localhost).
