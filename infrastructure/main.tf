# WS12 กิจกรรมที่ 1: Infrastructure as Code — สร้างเซิร์ฟเวอร์บน AWS EC2 ด้วยโค้ด
#   cd infrastructure
#   (Credentials อ่านจาก ~/.aws/credentials หรือ env AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN — ห้าม commit)
#   terraform init && terraform plan && terraform apply
#   terraform output -raw server_ip
 
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
 
provider "aws" {
  region = var.region
 
  default_tags {
    tags = {
      Project = var.project_name
    }
  }
}
 
# Ubuntu 22.04 LTS ล่าสุดจาก Canonical (owner 099720109477 = บัญชีทางการของ Canonical)
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]
 
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
 
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}
 
# อัปโหลด Public key เป็น Key Pair แล้วผูกกับเครื่อง จึง SSH เข้าได้ด้วยกุญแจ
resource "aws_key_pair" "deploy" {
  key_name   = "${var.project_name}-deploy"
  public_key = file(pathexpand(var.ssh_public_key_path))
}
 
# Security Group (WS10: "ถ้าผมรู้ IP คุณ ยิงตรงเข้า 5432 ได้ไหม?" -> ไม่ได้ เปิดแค่ 22 และ 80)
# ไม่ระบุ vpc_id จึงใช้ Default VPC ของ Region
resource "aws_security_group" "app" {
  name        = "${var.project_name}-sg"
  description = "Allow SSH and HTTP only"
 
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_allowed_cidrs
  }
 
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
 
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
 
resource "aws_instance" "app" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type # 1GB RAM (ขนาดเล็กสุดที่รันระบบนี้ได้)
  key_name               = aws_key_pair.deploy.key_name
  vpc_security_group_ids = [aws_security_group.app.id]
 
  root_block_device {
    volume_size = var.root_volume_size
    volume_type = "gp3"
  }
 
  # บังคับ IMDSv2 (ต้องใช้ Token) ป้องกันการขโมย Credentials ผ่านช่องโหว่ SSRF
  metadata_options {
    http_tokens   = "required"
    http_endpoint = "enabled"
  }
 
  # cloud-init: ติดตั้ง Docker + Compose plugin + swap 2GB ให้อัตโนมัติตอนเครื่องบูตครั้งแรก
  user_data = file("${path.module}/cloud-init.yml")
 
  tags = {
    Name = "${var.project_name}-server"
  }
 
  # most_recent = true จะได้ AMI ใหม่เมื่อ Canonical ออกเวอร์ชันใหม่ ถ้าไม่ ignore
  # terraform apply ครั้งถัดไปจะ "สร้างเครื่องใหม่แทน" และข้อมูลใน Volume หายทั้งหมด
  lifecycle {
    ignore_changes = [ami, user_data]
  }
}
 
# Elastic IP: IP คงที่ ไม่เปลี่ยนเมื่อ Stop/Start เครื่อง (AWS Academy หยุดเครื่องทุกครั้งที่จบ Session)
resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"
 
  tags = {
    Name = "${var.project_name}-eip"
  }
}

