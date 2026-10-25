output "server_ip" {
  description = "Elastic IP ของเซิร์ฟเวอร์ (นำไปใส่ GitHub Secret: SERVER_HOST)"
  value       = aws_eip.app.public_ip
}
 
output "ssh_command" {
  value = "ssh -i ~/.ssh/ecommerce_deploy ubuntu@${aws_eip.app.public_ip}"
}
 
output "health_url" {
  value = "http://${aws_eip.app.public_ip}/health"
}

