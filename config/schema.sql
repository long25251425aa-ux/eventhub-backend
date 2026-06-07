CREATE DATABASE IF NOT EXISTS eventhub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE eventhub;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin','user') DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type ENUM('Hoi thao','Workshop','Concert') NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  time TIME NOT NULL,
  location VARCHAR(255) NOT NULL,
  capacity INT NOT NULL DEFAULT 100,
  sold INT NOT NULL DEFAULT 0,
  price DECIMAL(12,0) NOT NULL DEFAULT 0,
  emoji VARCHAR(10) DEFAULT '🎪',
  bg_color VARCHAR(20) DEFAULT '#1a1510',
  speakers JSON,
  status ENUM('active','sold-out','cancelled') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  event_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  total_price DECIMAL(14,0) NOT NULL DEFAULT 0,
  ticket_code VARCHAR(20) UNIQUE NOT NULL,
  status ENUM('active','checked','cancelled') DEFAULT 'active',
  checked_in BOOLEAN DEFAULT FALSE,
  checked_in_at TIMESTAMP NULL,
  seats JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- Seed: password = "admin123" and "user123" (bcrypt rounds=10)
INSERT IGNORE INTO users (name,email,password,role) VALUES
('Administrator','admin@eventhub.vn','$2b$10$K7L1OJ45/4Y2nIvhRVpCe.FImD/2WmtL0wKQHv1A5k2PZNfHZeKzO','admin'),
('Nguyen Van A','user@eventhub.vn','$2b$10$VpKzIqA3eHJ9ZMcNO5UHoOQ4Ag7XsV/DCMKB2K0ioqZJFaqYMSNTe','user');

INSERT IGNORE INTO events (name,type,description,date,time,location,capacity,sold,price,emoji,bg_color,speakers,status) VALUES
('Vietnam Tech Summit 2025','Hoi thao','Hoi thao cong nghe hang dau Viet Nam voi hon 50 dien gia quoc te, thao luan ve AI, Blockchain va tuong lai so.','2025-08-15','08:00:00','GEM Center, Quan 1, TP.HCM',300,247,350000,'🏛','#1a1510','["Nguyen Minh Tuan - CTO FPT","Sarah Chen - Google Cloud","David Park - Microsoft Asia"]','active'),
('ReactJS Workshop Advanced','Workshop','Workshop chuyen sau ve ReactJS, Next.js 14, Server Components va toi uu hieu suat ung dung.','2025-08-22','09:00:00','Khong gian Sang tao, Quan 3',50,48,500000,'⚛','#0a1520','["Tran Huu Duc - Senior Dev Tiki","Le Thi Mai - Frontend Lead Shopee"]','active'),
('Jazz Night: Mua Sai Gon','Concert','Dem nhac Jazz dac biet mang am huong Sai Gon xua voi cac nghe si hang dau trong va ngoai nuoc.','2025-09-05','20:00:00','Nha hat Thanh pho HCM',500,312,450000,'🎷','#14091e','["Trong Hieu - Vocalist","Ha Linh Band","Saigon Jazz Quartet"]','active'),
('Startup Funding Forum','Hoi thao','Dien dan ket noi startup voi nha dau tu, chia se kinh nghiem goi von Series A/B.','2025-09-20','13:00:00','Saigon Innovation Hub',200,89,0,'💡','#0a140a','["VinaCapital Partners","Mekong Capital","500 Startups Vietnam"]','active'),
('UI/UX Design Thinking','Workshop','Workshop thiet ke tu duy UX chuyen sau, tu research den prototype va usability testing.','2025-09-12','09:00:00','Toong Coworking, Binh Thanh',30,30,600000,'🎨','#1a0a0a','["Pham Quoc Hung - Design Lead VNG"]','sold-out'),
('K-Pop Cover Dance Contest','Concert','Cuoc thi cover nhay K-pop lon nhat TP.HCM voi giai thuong hap dan.','2025-10-01','17:00:00','SVD Phu Tho',1000,634,150000,'🎤','#14091a','["MC Tran Thanh","Ban Giam Khao Chuyen Nghiep"]','active');
