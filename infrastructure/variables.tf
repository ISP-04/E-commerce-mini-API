variable "project_name" {
  description = "ชื่อโปรเจกต์ (ใช้ตั้งชื่อ resource)"
  type        = string
  default     = "ecommerce-mini-api"
}
 
variable "region" {
  description = "Region ของ AWS (AWS Academy มักจำกัดไว้ที่ us-east-1 / บัญชีส่วนตัวใช้ ap-southeast-1 = Singapore ใกล้ไทยที่สุด)"
  type        = string
  default     = "us-east-1"
}
 
variable "instance_type" {
  description = "ขนาดเครื่อง EC2 (t3.micro = 2 vCPU / 1GB RAM)"
  type        = string
  default     = "t3.micro"
}
 
variable "root_volume_size" {
  description = "ขนาดดิสก์ (GB) ค่าเริ่มต้นของ AMI คือ 8GB ซึ่งไม่พอสำหรับ Image หลายตัว + swap"
  type        = number
  default     = 20
}
 
variable "ssh_public_key_path" {
  description = "Path ของ Public key ที่จะสร้างเป็น Key Pair บน AWS"
  type        = string
  default     = "~/.ssh/ecommerce_deploy.pub"
}
 
variable "ssh_allowed_cidrs" {
  description = "IP ที่อนุญาตให้ SSH (GitHub Actions runner ใช้ IP ไม่คงที่ จึงต้องเปิด 0.0.0.0/0 หากใช้ CD ผ่าน SSH)"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

