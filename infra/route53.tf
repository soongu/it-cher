# 이미 존재하는 호스팅 영역(도메인 등록처가 Route53) 조회.
data "aws_route53_zone" "site" {
  name         = var.domain_name
  private_zone = false
}

# apex (it-cher.com) → CloudFront 별칭(A/AAAA)
# allow_overwrite=true: 영역에 기존 apex A/AAAA 레코드가 있어도 Terraform이 인수(첫 apply 실패 방지).
resource "aws_route53_record" "apex_a" {
  zone_id         = data.aws_route53_zone.site.zone_id
  name            = var.domain_name
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "apex_aaaa" {
  zone_id         = data.aws_route53_zone.site.zone_id
  name            = var.domain_name
  type            = "AAAA"
  allow_overwrite = true

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

# www → 같은 배포(create_www=true 일 때만)
resource "aws_route53_record" "www_a" {
  count           = var.create_www ? 1 : 0
  zone_id         = data.aws_route53_zone.site.zone_id
  name            = local.www_domain
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www_aaaa" {
  count           = var.create_www ? 1 : 0
  zone_id         = data.aws_route53_zone.site.zone_id
  name            = local.www_domain
  type            = "AAAA"
  allow_overwrite = true

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}
