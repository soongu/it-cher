provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.tags
  }
}

# CloudFront에 붙일 ACM 인증서는 반드시 us-east-1 에 있어야 한다(글로벌 엣지 요구사항).
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.tags
  }
}

locals {
  name_prefix = replace(var.domain_name, ".", "-") # it-cher.com -> it-cher-com
  bucket_name = var.bucket_name != "" ? var.bucket_name : "${local.name_prefix}-site"
  www_domain  = "www.${var.domain_name}"
  aliases     = var.create_www ? [var.domain_name, local.www_domain] : [var.domain_name]

  tags = merge({
    Project   = "it-cher"
    Site      = var.domain_name
    ManagedBy = "terraform"
  }, var.tags)
}
