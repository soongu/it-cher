terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
  }

  # 기본은 로컬 상태(terraform.tfstate). 팀/CI 공유가 필요해지면 아래 S3 백엔드를 켜고
  # `terraform init -migrate-state` 로 이전한다(버킷·DynamoDB 잠금테이블은 사전 생성 필요).
  # backend "s3" {
  #   bucket         = "it-cher-tfstate"
  #   key            = "site/terraform.tfstate"
  #   region         = "ap-northeast-2"
  #   dynamodb_table = "it-cher-tflock"
  #   encrypt        = true
  # }
}
