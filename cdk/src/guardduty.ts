import path from 'path';
import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include';
import { Construct } from 'constructs';

export class GuardDutyStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);
    new CfnInclude(this, 'SuperwerkerTemplate', {
      templateFile: path.join(__dirname, '..', '..', 'templates', 'guardduty.yaml'),
    });
  }
}
