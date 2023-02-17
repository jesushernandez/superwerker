import path from 'path';
import * as pythonLambda from '@aws-cdk/aws-lambda-python-alpha';
import { NestedStack, NestedStackProps, aws_lambda as lambda, aws_iam as iam, Duration, Arn, ArnFormat, CfnParameter } from 'aws-cdk-lib';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

export class LivingDocumentationStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const superwerkerDomain = new CfnParameter(this, 'SuperwerkerDomain', {
      type: 'String',
    });

    // DashboardGeneratorFunction
    const dashboardGeneratorFunction = new pythonLambda.PythonFunction(this, 'DashboardGeneratorFunction', {
      entry: path.join(__dirname, '..', 'functions', 'living_documentation_dashboard_generator'),
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_9,
      environment: {
        SUPERWERKER_DOMAIN: superwerkerDomain.valueAsString,
      },
    });

    (dashboardGeneratorFunction.node.defaultChild as lambda.CfnFunction).overrideLogicalId('DashboardGeneratorFunction');

    const ssmParametersDescribe = new iam.PolicyStatement({
      actions: ['ssm:DescribeParameters'],
      resources: ['*'],
      effect: iam.Effect.ALLOW,
    });

    const ssmParameterRead = new iam.PolicyStatement({
      actions: [
        'ssm:GetParameters',
        'ssm:GetParameter',
        'ssm:GetParametersByPath',
      ],
      resources: [Arn.format({
        partition: this.partition,
        service: 'ssm',
        region: this.region,
        account: this.account,
        resource: 'parameter',
        resourceName: 'superwerker/*',
      })],
      effect: iam.Effect.ALLOW,
    });

    const cloudwatchPutDashboard = new iam.PolicyStatement({
      actions: ['cloudwatch:PutDashboard'],
      resources: [Arn.format({
        partition: this.partition,
        service: 'cloudwatch',
        region: '',
        account: this.account,
        resource: 'dashboard',
        resourceName: 'superwerker',
        arnFormat: ArnFormat.SLASH_RESOURCE_NAME, // which is the default
      })],
      effect: iam.Effect.ALLOW,
    });

    const cloudwatchDescribeAlarms = new iam.PolicyStatement({
      actions: ['cloudwatch:DescribeAlarms'],
      resources: [Arn.format({
        partition: this.partition,
        service: 'cloudwatch',
        region: this.region,
        account: this.account,
        resource: 'alarm',
        resourceName: 'superwerker-RootMailReady',
        arnFormat: ArnFormat.COLON_RESOURCE_NAME,
      })],
      effect: iam.Effect.ALLOW,
    });

    dashboardGeneratorFunction.role?.attachInlinePolicy(
      new iam.Policy(this, 'dashboard-generator-function', {
        statements: [
          ssmParametersDescribe,
          ssmParameterRead,
          cloudwatchPutDashboard,
          cloudwatchDescribeAlarms,
        ],
      }),
    );

    const rule = new Rule(this, 'ScheduleLivingDocumentationRefresh', {
      schedule: Schedule.rate(Duration.minutes(1)), // runs in Lambda free tier
    });

    rule.addTarget(new LambdaFunction(dashboardGeneratorFunction));
  }
}
