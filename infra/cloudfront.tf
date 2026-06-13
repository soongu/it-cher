# S3 비공개 오리진 접근용 OAC(Origin Access Control, OAI 대체 최신 방식).
resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${local.name_prefix}-oac"
  description                       = "OAC for ${var.domain_name} static site"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# 디렉터리/확장자없는 URI를 index.html 로 재작성하는 viewer-request 함수.
resource "aws_cloudfront_function" "rewrite" {
  name    = "${local.name_prefix}-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Astro directory-format URI -> index.html"
  publish = true
  code    = file("${path.module}/cloudfront-rewrite.js")
}

# 보안 응답 헤더 — HSTS + 기본 하드닝. frame_options=SAMEORIGIN(데크는 동일 출처 iframe이라 유지).
# preload=false(되돌리기 어려운 preload 등록은 보류; 운영 안정 후 true+제출 가능).
resource "aws_cloudfront_response_headers_policy" "security" {
  name = "${local.name_prefix}-security-headers"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = false
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "SAMEORIGIN"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "it-cher static site (${var.domain_name})"
  default_root_object = "index.html"
  price_class         = var.price_class
  aliases             = local.aliases

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "s3-${local.bucket_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-${local.bucket_name}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # Managed-CachingOptimized (오리진 Cache-Control 존중 + gzip/br). 배포마다 /* 무효화로 HTML 즉시 갱신.
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.rewrite.arn
    }
  }

  # 없는 경로 → 친절한 404 페이지(비전공자 막다른 길 방지). OAC 비공개 버킷은 누락 키에 403을 주므로 둘 다 매핑.
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }
  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  depends_on = [aws_acm_certificate_validation.site]
}
