/// <reference path="./.sst/platform/config.d.ts" />

/**
 * SST v3 (Ion) configuration — deploys the entire Next.js app to AWS:
 *   • Lambda function for SSR + API routes (/api/analyze)
 *   • S3 bucket for static assets
 *   • CloudFront CDN in front of everything
 *
 * Usage:
 *   npx sst deploy --stage production
 *
 * Prerequisites:
 *   • AWS credentials configured (aws configure)
 *   • Environment variables set in .env (or .env.production)
 */

export default $config({
  app(input) {
    return {
      name: "healthcare-symptom-checker",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          // Change to your preferred region
          region: "ap-south-1",
        },
      },
    };
  },
  async run() {
    const site = new sst.aws.Nextjs("HealthcareApp", {
      // Pass your secrets as environment variables to the Lambda
      environment: {
        HF_API_KEY: process.env.HF_API_KEY!,
        HF_MODEL_NAME:
          process.env.HF_MODEL_NAME ?? "meta-llama/Llama-3.1-8B-Instruct",
        HF_FALLBACK_MODEL_NAME:
          process.env.HF_FALLBACK_MODEL_NAME ??
          "Qwen/Qwen2.5-7B-Instruct",
        HF_TEMPERATURE: process.env.HF_TEMPERATURE ?? "0.1",
        HF_MAX_TOKENS: process.env.HF_MAX_TOKENS ?? "1024",
        HF_WAIT_FOR_MODEL_MAX_MS:
          process.env.HF_WAIT_FOR_MODEL_MAX_MS ?? "15000",
        ANALYZE_TIMEOUT_MS: process.env.ANALYZE_TIMEOUT_MS ?? "20000",
      },
      // Optional: custom domain (uncomment and configure)
      // domain: {
      //   name: "symptomchecker.yourdomain.com",
      //   dns: sst.aws.dns(),
      // },
    });

    return {
      url: site.url,
    };
  },
});
