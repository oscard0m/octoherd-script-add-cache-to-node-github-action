// @ts-check

import { composeCreateOrUpdateTextFile } from "@octokit/plugin-create-or-update-text-file";
import prettier from "prettier";
import YAML from 'yaml'

const { parseDocument, parse, stringify, Document } = YAML

const isYamlFile = (fileName) => {
  const yamlFilePattern = /^.*\.ya?ml$/;
  return yamlFilePattern.test(fileName);
};

/**
 * Add cache parameter to GitHub Actions using setup-node
 *
 * @param {import('@octoherd/cli').Octokit} octokit
 * @param {import('@octoherd/cli').Repository} repository
 * @param {object} options
 * @param {string} [options.cache] Select which package manager you want to use for caching
 */
export async function script(octokit, repository, { cache = "npm" }) {
  // Global variables used throughout the code
  const owner = repository.owner.login;
  const repo = repository.name;
  const defaultBranch = repository.default_branch;
  const branchName = "add-cache-to-node-workflows";
  const path = ".github/workflows";

  // Get info on repository branches
  const { data: branches } = await octokit.request(
    "GET /repos/{owner}/{repo}/branches",
    {
      owner,
      repo,
      branch: defaultBranch,
    }
  );

  // Get SHA of repository's default branch
  const sha = branches
    .filter((branch) => branch.name === defaultBranch)
    .map((branch) => branch.commit.sha)[0];
  const branchExists = branches.some((branch) => branch.name === branchName);

  // Create branch if not present
  if (!branchExists) {
    const ref = await octokit
      .request("POST /repos/{owner}/{repo}/git/refs", {
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha,
      })
      .then((response) => response.data.ref);

    if (!ref) {
      octokit.log.warn(`Error creating branch in ${repository.html_url}`);

      return;
    }
  }

  // Get all files from .github/workflows folder
  const { data: files } = await octokit.request(
    "GET /repos/{owner}/{repo}/contents/{path}",
    {
      owner,
      repo,
      path,
    }
  );

  if (!Array.isArray(files)) {
    throw new Error("The path is not a folder"); //TODO
  }

  const workflowFiles = files.filter((file) => isYamlFile(file.name));
  let workflowsUpdated = false;

  for (const workflowFile of workflowFiles) {
    const { data, updated } = await composeCreateOrUpdateTextFile(octokit, {
      owner,
      repo,
      path: workflowFile.path,
      branch: branchName,
      message: `ci(workflow): add '${cache}' cache for actions/setup-node in ${workflowFile.name}`,
      content: ({ exists, content }) => {
        const yamlDocument = parseDocument(content);
        const jobs = yamlDocument.get('jobs')

        for(let i = 0; i < jobs.items.length; i++) {
          const job = jobs.items[i].value
          const steps = job.get('steps')
          for(let j = 0; j <steps.items.length; j++) {
            const step = steps.get(j)
            const stepUses = step.get('uses')
            const stepWith = step.get('with')
            
            if (
              stepUses &&
              stepUses.includes("actions/setup-node") &&
              !stepWith.get('cache')
            ) {
              stepWith.set('cache', cache);
            }
          }
        };

        return prettier.format(
          yamlDocument.toString(),
          {
            parser: "yaml",
          }
        );
      },
    });

    if (updated) {
      octokit.log.info(
        `${path} updated in ${repository.html_url} via ${data.commit.html_url}`
      );

      workflowsUpdated = true;
    }
  }

  if (workflowsUpdated) {
    //
    // Pull Request
    //

    // Create pull request
    const { data: pr } = await octokit.request(
      "POST /repos/{owner}/{repo}/pulls",
      {
        owner,
        repo,
        head: branchName,
        base: defaultBranch,
        title: "ci(workflow): add cache to workflows using actions/setup-node",
      }
    );

    octokit.log.info(`Create Pull Request at ${pr.html_url}`);

    // Add the "maintenance" label to the pull request
    await octokit.request(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/labels",
      {
        owner,
        repo,
        issue_number: pr.number,
        labels: ["maintenance"],
      }
    );
  } else {
    octokit.log.info("There were no workflows to update");
  }
}
