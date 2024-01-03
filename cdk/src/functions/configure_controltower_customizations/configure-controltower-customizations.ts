import Fs from 'fs';
import { CodeCommit, SSM } from 'aws-sdk';
import * as Handlebars from 'handlebars';

const codecommit = new CodeCommit();
const ssm = new SSM();

const BRANCH_NAME = 'main';
const REPOSITORY_NAME = 'custom-control-tower-configuration';

export async function handler(event: any, _context: any) {
  const AWS_REGION = process.env.AWS_REGION;

  const snsMessage = event.Records[0].Sns.Message;
  if (!snsMessage.includes('CREATE_COMPLETE')) {
    console.log('stack is not in CREATE_COMPLETE state, nothing to do yet');
    return;
  }

  const SSM_PARAMETER = { Name: process.env.CONTROLTOWER_CUSTOMIZATIONS_DONE_SSM_PARAMETER };
  let customizationsConfigured = true;
  try {
    await ssm.getParameter(SSM_PARAMETER).promise();
  } catch (err) {
    if (err) {
      customizationsConfigured = false;
    }
  }

  if (customizationsConfigured) {
    console.log('Control tower customizations have been configured initially, nothing to do.');
    return;
  } else {
    console.log('Control tower customizations have not been configured yet, starting initial configuration.');
  }

  console.log('adding variables to manifest.yaml');
  await addVariablesToManifest(AWS_REGION!);

  console.log('making inital commit');
  await makeInitalCommit();

  console.log('setting initial commit ssm parameter');
  const params = {
    Name: SSM_PARAMETER.Name,
    Value: 'true',
    Type: 'String',
  };
  await ssm
    .putParameter(params, function (err, data) {
      if (err) console.log(err, err.stack);
      else console.log(data);
    })
    .promise();
}

async function makeInitalCommit() {
  const branchInfo = await codecommit.getBranch({ branchName: BRANCH_NAME, repositoryName: REPOSITORY_NAME }).promise();
  const commitId = branchInfo.branch!.commitId;

  const params = {
    branchName: BRANCH_NAME,
    repositoryName: REPOSITORY_NAME,
    commitMessage: 'inital configuration',
    parentCommitId: commitId,
    putFiles: getFilesToUpload(),
  };
  await codecommit
    .createCommit(params, function (err, data) {
      if (err) console.log(err, err.stack);
      else console.log(data);
    })
    .promise();
}

function getFilesToUpload() {
  // TODO dynamically get files from config directory
  let filesToUpload = [
    {
      filePath: '/service-control-policies/superwerker-sandbox-scp.json',
      fileContent: getBufferFromFile('./config/service-control-policies/superwerker-sandbox-scp.json'),
    },
    {
      filePath: '/service-control-policies/superwerker-cfct-only-us-scp.json',
      fileContent: getBufferFromFile('./config/service-control-policies/superwerker-cfct-only-us-scp.json'),
    },
    {
      filePath: '/cloudformation/iam-access-analyzer.yaml',
      fileContent: getBufferFromFile('./config/cloudformation/iam-access-analyzer.yaml'),
    },
    {
      filePath: '/manifest.yaml',
      fileContent: getBufferFromFile('/tmp/manifest.yaml'),
    },
  ];
  return filesToUpload;
}

function getBufferFromFile(filePath: string) {
  return Buffer.from(Fs.readFileSync(filePath).toString('utf-8'));
}

function addVariablesToManifest(region: string) {
  const source = Fs.readFileSync('./config/manifest.yaml').toString();
  const template = Handlebars.compile(source);
  const contents = template({ REGION: `${region}` });
  Fs.writeFileSync('/tmp/manifest.yaml', contents);
}
