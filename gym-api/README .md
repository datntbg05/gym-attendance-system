# gym-api

API cho ứng dụng Chấm công Gym, viết bằng Node.js (Express) và PostgreSQL.

## Chạy

```bash
cp .env.example .env     # điền giá trị thật
docker compose up -d     # PostgreSQL, tự chạy schema.sql ở lần khởi động đầu tiên
npm install
node server.js
```

API chạy ở cổng `4000` (đổi bằng biến `PORT`).

## Biến môi trường (`.env`)

| Biến | Ý nghĩa |
|---|---|
| `PORT` | Cổng chạy API (mặc định 4000) |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL |
| `DB_PASSWORD` | Mật khẩu PostgreSQL, dùng bởi `docker-compose.yml` |
| `JWT_SECRET` | Chuỗi bí mật để ký thẻ đăng nhập. Tạo bằng `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ZALO_SECRET_KEY` | Secret key của Mini App, lấy trên trang quản lý Zalo |
| `CORS_ORIGINS` | Các nguồn được phép gọi API, cách nhau bằng dấu phẩy. Để trống khi phát triển |

## Cơ sở dữ liệu

`schema.sql` tạo 3 bảng:

- `branches`: chi nhánh, tọa độ và bán kính chấm công (mét).
- `employees`: nhân viên, số điện thoại dạng `84xxxxxxxxx`, chức vụ, liên kết Zalo.
- `attendance`: mỗi dòng là một lượt vào / ra.

Số điện thoại, tọa độ trong file là **dữ liệu mẫu**, cần thay bằng thông tin thật.

## API

Các API (trừ đăng nhập) cần header `Authorization: Bearer <token>`.

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/api/login` | Đăng nhập bằng token số điện thoại của Zalo |
| POST | `/api/punch` | Check-in hoặc check-out tùy trạng thái, kiểm tra khoảng cách |
| GET | `/api/me/history` | Thông tin cá nhân, trạng thái và lịch sử theo tháng (`?month=YYYY-MM`) |

Chỉ dành cho tài khoản chức vụ `manager`:

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/admin/present` | Danh sách người đang có mặt |
| GET | `/api/admin/report` | Báo cáo giờ làm theo tháng (`?month=YYYY-MM`) |
| GET | `/api/admin/employees` | Danh sách nhân viên |
| POST | `/api/admin/employees` | Thêm nhân viên |
| POST | `/api/admin/employees/:id/active` | Khóa / mở khóa nhân viên |
| POST | `/api/admin/employees/:id/reset-zalo` | Đặt lại liên kết Zalo |

## Triển khai

- Bắt buộc dùng HTTPS khi Mini App chạy thật.
- Điền `CORS_ORIGINS`, dùng `JWT_SECRET` riêng cho môi trường thật.
- Sao lưu database định kỳ.
