# infra/ — it-cher 배포 인프라 (Terraform)

AWS S3 + CloudFront + ACM + Route53 로 `it-cher.com` 정적 사이트를 코드화한다.

**전체 절차·사전준비·함정은 → [`../docs/DEPLOY-AWS.md`](../docs/DEPLOY-AWS.md)**

## 빠른 사용

```bash
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
# 그다음 저장소 루트에서: npm run deploy
```

## 파일

| 파일 | 역할 |
|------|------|
| `versions.tf` | terraform/provider 버전, (주석)S3 상태 백엔드 |
| `variables.tf` | domain_name·aws_region·create_www·bucket_name·price_class |
| `providers.tf` | aws(기본=서울) + aws.us_east_1(ACM용) + locals |
| `s3.tf` | 비공개 버킷 + public access block + OAC 전용 정책 |
| `acm.tf` | us-east-1 인증서 + Route53 DNS 검증 |
| `cloudfront.tf` | OAC + URL재작성 함수 + 배포 + 404 매핑 |
| `route53.tf` | apex/www A·AAAA 별칭 레코드 |
| `outputs.tf` | 버킷명·배포ID·도메인·site_url (npm run deploy 가 읽음) |
| `cloudfront-rewrite.js` | viewer-request 함수: `/path/` → `/path/index.html` |

상태/변수/락 파일 커밋 정책은 `.gitignore` 참고(`.terraform.lock.hcl` 만 커밋).
