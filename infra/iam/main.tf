terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  default = "us-east-1"
}

variable "github_org" {
  description = "GitHub username or organization"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
}

variable "github_branch" {
  description = "Branch allowed to assume the role"
  default     = "main"
}

# --- OIDC Provider (one per account, create only if it doesn't exist) ---
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# --- CD Role ---
resource "aws_iam_role" "cd_role" {
  name = "marketlens-cd-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/${var.github_branch}"
          }
        }
      }
    ]
  })
}

# --- Attach the generated policy ---
resource "aws_iam_role_policy" "cd_policy" {
  name   = "marketlens-cd-policy"
  role   = aws_iam_role.cd_role.id
  policy = file("${path.module}/cd-role-policy.json")
}

output "cd_role_arn" {
  description = "ARN to set as AWS_DEPLOY_ROLE_ARN in GitHub repo variables"
  value       = aws_iam_role.cd_role.arn
}
