variable "aws_region" {
  description = "S3 버킷을 둘 리전. CloudFront는 글로벌이고 ACM 인증서는 항상 us-east-1 에 만든다."
  type        = string
  default     = "ap-northeast-2"
}

variable "domain_name" {
  description = "apex 도메인. Route53에 이미 등록/호스팅 영역이 존재해야 한다(도메인 등록처가 Route53)."
  type        = string
  default     = "it-cher.com"
}

variable "create_www" {
  description = "www 서브도메인도 같은 사이트로 서비스할지(인증서 SAN + CloudFront 별칭 + Route53 레코드 추가)."
  type        = bool
  default     = true
}

variable "bucket_name" {
  description = "S3 버킷명(전역 유니크). 비우면 도메인 기반으로 자동 생성(예: it-cher-com-site). 도메인명(점 포함)은 OAC TLS 문제로 피한다."
  type        = string
  default     = ""
}

variable "price_class" {
  description = "CloudFront 엣지 범위. PriceClass_200 = 북미·유럽·아시아(서울/도쿄 포함). 전체는 PriceClass_All."
  type        = string
  default     = "PriceClass_200"
}

variable "tags" {
  description = "모든 리소스에 추가로 붙일 태그."
  type        = map(string)
  default     = {}
}
