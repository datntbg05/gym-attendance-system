# Chấm công Gym – Zalo Mini App

Ứng dụng chấm công cho nhân viên phòng gym, chạy ngay trong Zalo. Nhân viên đăng nhập bằng số điện thoại Zalo và check-in / check-out khi đang có mặt tại phòng gym (kiểm tra bằng vị trí). Quản lý xem ai đang làm, báo cáo giờ làm theo tháng và quản lý danh sách nhân viên ngay trong app.

## Tính năng

**Nhân viên**
- Đăng nhập bằng số điện thoại Zalo, đối chiếu với danh sách nhân viên đã đăng ký.
- Check-in / check-out một nút, chỉ hợp lệ khi nằm trong bán kính cho phép quanh phòng gym.
- Xem lịch sử các lần chấm công và tổng số giờ trong tháng.

**Quản lý**
- Xem danh sách người đang có mặt.
- Báo cáo giờ làm của từng nhân viên theo tháng.
- Thêm nhân viên, khóa / mở khóa tài khoản, đặt lại liên kết Zalo khi nhân viên đổi điện thoại.

**Bảo mật**
- Server tự giải mã token Zalo (số điện thoại, vị trí) bằng secret key, không tin dữ liệu do app gửi lên.
- Mỗi tài khoản gắn với một tài khoản Zalo để hạn chế chấm công hộ.
- Mỗi nhân viên chỉ có tối đa một lượt chưa check-out, được ràng buộc ngay ở database.

## Công nghệ

| Phần | Công nghệ |
|---|---|
| Mini App | Zalo Mini App (zmp-cli), React, ZaUI |
| API | Node.js, Express, JWT |
| Cơ sở dữ liệu | PostgreSQL (chạy bằng Docker) |

## Cấu trúc thư mục

```
.
├── gym-api/          API (Node.js + Express) và schema database
└── gym-attendance/   Zalo Mini App (React)
```

## Cách chạy

### Yêu cầu
- Node.js 18 trở lên
- Docker Desktop
- `zmp-cli` (`npm i -g zmp-cli`)
- Tài khoản Zalo for Developers và một Mini App đã tạo trên trang quản lý, để lấy **Secret key** và xin quyền *số điện thoại*, *vị trí*

### 1. Database và API

```bash
cd gym-api
cp .env.example .env        # rồi điền giá trị thật vào .env
docker compose up -d        # khởi động PostgreSQL, tự chạy schema.sql lần đầu
npm install
node server.js              # API chạy ở http://localhost:4000
```

Chi tiết cấu hình và danh sách API xem [gym-api/README.md](gym-api/README.md).

### 2. Mini App

```bash
cd gym-attendance
npm install
zmp start                   # xem giao diện ở http://localhost:3000
```

Sửa `API_BASE` trong `src/api.js` thành địa chỉ API của bạn (cần HTTPS và đã khai báo domain trên trang quản lý Mini App khi chạy trong Zalo).

Lưu ý: việc lấy số điện thoại và vị trí chỉ hoạt động khi mở app **bên trong Zalo**, không chạy trên trình duyệt thường. Để thử đầy đủ, dùng `zmp deploy` rồi quét mã QR bằng tài khoản Zalo đã được thêm vào danh sách người dùng thử.

## Ghi chú

- Dữ liệu trong `schema.sql` chỉ là dữ liệu mẫu. Hãy thay số điện thoại, tọa độ và bán kính bằng thông tin thật của phòng gym.
- Không đưa file `.env` lên Git. Chỉ file `.env.example` được chia sẻ.
