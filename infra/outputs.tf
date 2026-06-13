output "s3_bucket_name" {
  description = "배포 대상 S3 버킷명 (npm run deploy 가 읽음)"
  value       = aws_s3_bucket.site.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront 배포 ID (무효화 대상)"
  value       = aws_cloudfront_distribution.site.id
}

output "cloudfront_domain_name" {
  description = "CloudFront 도메인 (xxxx.cloudfront.net) — DNS 전파 전 확인용"
  value       = aws_cloudfront_distribution.site.domain_name
}

output "site_url" {
  description = "최종 사이트 URL"
  value       = "https://${var.domain_name}"
}

output "route53_zone_id" {
  value = data.aws_route53_zone.site.zone_id
}

output "deploy_env" {
  description = "terraform 없이 배포할 때 쓸 환경변수 (eval $(terraform output -raw deploy_env) 형태로도 사용 가능)"
  value       = "ITCHER_S3_BUCKET=${aws_s3_bucket.site.bucket} ITCHER_CF_DISTRIBUTION_ID=${aws_cloudfront_distribution.site.id}"
}
