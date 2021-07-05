// @ts-check

import { composeCreatePullRequest } from "octokit-plugin-create-pull-request";
import prettier from "prettier";
import YAML from "yaml";

const { parseDocument } = YAML;

const BRANCH_NAME = "add-cache-to-node-workflows";
const PATH = ".github/workflows";

/**
 * Check if a filename is a YAML file
 *
 * @param {string} fileName FileName to be tested
 *
 * @return {boolean}
 */
const isYamlFile = (fileName) => /\.ya?ml$/.test(fileName);

/**
 * Add cache parameter to GitHub Actions using setup-node
 *
 * @param {import('@octoherd/cli').Octokit} octokit
 * @param {import('@octoherd/cli').Repository} repository
 * @param {object} options
 * @param {string} [options.cache] Select which package manager you want to use for caching
 */
export async function script(octokit, repository, { cache = "npm" }) {
  if (repository.archived) {
    octokit.log.info(`${repository.html_url} is archived, ignoring.`);
    return;
  }

  // Global variables used throughout the code
  const owner = repository.owner.login;
  const repo = repository.name;
  const defaultBranch = repository.default_branch;

  // Get all files from .github/workflows folder
  let files;
  try {
    const { data } = await octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        owner,
        repo,
        path: PATH,
      }
    );

    files = data;
  } catch (e) {
    if (e.status === 404) {
      octokit.log.warn(`"${PATH}" path not found in ${repository.full_name}`);
      return;
    } else {
      throw e;
    }
  }

  if (!Array.isArray(files)) {
    throw new Error(`"${PATH}" is not a folder in ${repository.full_name}`);
  }

  const workflowFiles = files.filter((file) => isYamlFile(file.name));
  const filesToEdit = {};

  workflowFiles.forEach((element) => {
    filesToEdit[element.path] = ({ content, encoding }) => {
      const yamlDocument = parseDocument(
        Buffer.from(content, encoding).toString("utf-8")
      );
      const jobs = yamlDocument.get("jobs");
      let cacheAdded = false;

      for (const { value: job } of jobs.items) {
        const steps = job.get("steps");
        for (const step of steps.items) {
          const stepUses = step.get("uses");
          const stepWith = step.get("with");

          if (
            stepUses &&
            stepUses.includes("actions/setup-node") &&
            (!stepWith || !stepWith.get("cache"))
          ) {
            if (!stepWith) {
              step.set("with", { cache });
            } else {
              stepWith.set("cache", cache);
            }

            if (stepUses === "actions/setup-node@v1") {
              step.set("uses", "actions/setup-node@v2");
            }

            cacheAdded = true;
          }
        }
      }

      return cacheAdded
        ? prettier.format(yamlDocument.toString(), {
            parser: "yaml",
          })
        : null;
    };
  });

  const prCreated = await composeCreatePullRequest(octokit, {
    owner,
    repo,
    title: "ci(workflow): add cache to workflows using actions/setup-node",
    body: `## Description

Add \`cache\` to workflows using \`actions/setup-node\`

## Context

\`setup-node\` GitHub Action just released a new option to add cache to steps using it.

You can find the details here: https://github.blog/changelog/2021-07-02-github-actions-setup-node-now-supports-dependency-caching/

---

🤖 This PR has been generated automatically by [this octoherd script](https://github.com/oscard0m/octoherd-script-add-cache-to-node-github-action), feel free to run it in your GitHub user/org repositories! 💪🏾
`,
    base: defaultBranch,
    head: BRANCH_NAME,
    createWhenEmpty: false,
    changes: [
      {
        files: filesToEdit,
        commit: `ci(workflow): add '${cache}' cache for actions/setup-node in ${PATH}`,
        emptyCommit: false,
      },
    ],
  });

  if (!prCreated) {
    octokit.log.warn(`No Pull Request created for ${repository.full_name}`);
    return;
  }

  octokit.log.info(`Pull Request created at ${prCreated.data.html_url}`);
}
