#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as alias from "aws-cdk-lib/aws-route53-targets";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { InstanceClass, InstanceSize } from "aws-cdk-lib/aws-ec2";
import { Ec2Construct } from "../lib/aws-cdk-alb-asg-ec2-construct";

import * as dotenv from "dotenv";
import { VpcConstruct } from "../lib/aws-cdk-alb-asg-vpc-construct";
dotenv.config();

const STACK_NAME = "CabiApplicationStack";
const DOMAIN_NAME = "cabi.exchange-diary.com"; // TODO: Make this configurable
const AMAZON_LINUX_2023_AMI =
  "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64";

export class AwsCdkAlbAsgEc2Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC Construct 생성
    const vpcConstruct = new VpcConstruct(this, `${STACK_NAME}-VpcConstruct`);

    // ACM 인증서 생성
    const certificate = new acm.Certificate(this, `${STACK_NAME}-Certificate`, {
      domainName: DOMAIN_NAME,
      validation: acm.CertificateValidation.fromDns(),
    });

    // IAM 역할 생성
    const instanceRole = new iam.Role(this, `${STACK_NAME}-InstanceRole`, {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        // SSM 권한 추가
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
        // CodeDeploy 권한 추가
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonEC2RoleforAWSCodeDeploy"
        ),
      ],
    });

    // EC2 인스턴스 생성
    const app = new Ec2Construct(this, `${STACK_NAME}-Ec2Construct`, {
      vpcConstruct,
      machineImage: ec2.MachineImage.fromSsmParameter(AMAZON_LINUX_2023_AMI),
      certificateArn: certificate.certificateArn,
      instanceType: ec2.InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
      instanceIAMRoleArn: instanceRole.roleArn,
      instancePort: 80,
      healthCheckPath: "/",
      healthCheckPort: "80",
      healthCheckHttpCodes: "200",
    });

    // Route 53 호스팅 영역 생성
    const route53HostedZone = new route53.PublicHostedZone(
      this,
      `${STACK_NAME}-HostedZone`,
      {
        zoneName: DOMAIN_NAME,
      }
    );

    // Route 53 A 레코드 생성
    new route53.ARecord(this, `${STACK_NAME}-AliasRecord`, {
      zone: route53HostedZone,
      target: route53.RecordTarget.fromAlias(
        new alias.LoadBalancerTarget(app.loadBalancer)
      ),
      recordName: DOMAIN_NAME,
    });
  }
}

const app = new cdk.App();

new AwsCdkAlbAsgEc2Stack(app, `${STACK_NAME}-AwsCdkAlbAsgEc2Stack`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

app.synth();
