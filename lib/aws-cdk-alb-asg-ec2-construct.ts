import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as iam from "aws-cdk-lib/aws-iam";
import { VpcConstruct } from "./aws-cdk-alb-asg-vpc-construct";

interface ICdkEc2Props {
  vpcConstruct: VpcConstruct;
  machineImage: ec2.IMachineImage;
  certificateArn: string;
  instanceType: ec2.InstanceType;
  instanceIAMRoleArn: string;
  instancePort: number;
  healthCheckPath: string;
  healthCheckPort: string;
  healthCheckHttpCodes: string;
}
export class Ec2Construct extends Construct {
  readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  readonly vpcConstruct: VpcConstruct;

  constructor(scope: Construct, id: string, props: ICdkEc2Props) {
    super(scope, id);

    this.vpcConstruct = props.vpcConstruct;

    // Create an Application Load Balancer
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      `${id}-ApplicationLoadBalancerPublic`,
      {
        vpc: this.vpcConstruct.vpc,
        internetFacing: true,
      }
    );

    // Create a listener for HTTPS
    const httpsListener = this.loadBalancer.addListener(
      `${id}-ALBListenerHttps`,
      {
        certificates: [elbv2.ListenerCertificate.fromArn(props.certificateArn)],
        protocol: elbv2.ApplicationProtocol.HTTPS,
        port: 443,
        sslPolicy: elbv2.SslPolicy.TLS12,
      }
    );

    // Create an Auto Scaling Group
    const autoScalingGroup = new autoscaling.AutoScalingGroup(
      this,
      `${id}-AutoScalingGroup`,
      {
        vpc: this.vpcConstruct.vpc,
        instanceType: props.instanceType,
        machineImage: props.machineImage,
        allowAllOutbound: true,
        role: iam.Role.fromRoleArn(
          this,
          `${id}-IamRoleEc2Instance`,
          props.instanceIAMRoleArn
        ),
        healthCheck: autoscaling.HealthCheck.ec2(),
      }
    );

    // Add user data to the instance
    autoScalingGroup.addUserData(
      "sudo yum install -y https://s3.region.amazonaws.com/amazon-ssm-region/latest/linux_amd64/amazon-ssm-agent.rpm"
    );
    autoScalingGroup.addUserData("sudo systemctl enable amazon-ssm-agent");
    autoScalingGroup.addUserData("sudo systemctl start amazon-ssm-agent");
    autoScalingGroup.addUserData(
      'echo "Hello Wolrd" > /var/www/html/index.html'
    );

    httpsListener.addTargets(`${id}-TargetGroup`, {
      port: props.instancePort,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [autoScalingGroup], //Reference of our Austo Scaling group.
      healthCheck: {
        path: props.healthCheckPath,
        port: props.healthCheckPort,
        healthyHttpCodes: props.healthCheckHttpCodes,
      },
    });
  }
}
