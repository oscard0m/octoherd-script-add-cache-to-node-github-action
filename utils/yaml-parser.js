import YAML from "yaml";
import prettier from "prettier";

const { parseDocument } = YAML;

/**
 * @param {string} cache
 *
 * @return {function}
 */

export function getAddCacheToSetupNodeFunction(cache) {
  /**
   * Adds 'cache' option to 'setup-node' step of a GitHub Action
   * @param {object} options
   * @param {string} [options.content] File content of the GitHub Action
   * @param {string} [options.encoding] Encoding to use to get the stringified content of the GitHub Action
   *
   * @return {?string} Returns the content of the GitHub Action file  with 'cache' option added or null if the file was not modified
   */
  return function addCacheToSetupNodeStep({ content, encoding }) {
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

    return cacheAdded ? prettier.format(
		yamlDocument.toString({lineWidth: 0}), {
			parser: 'yaml'
		}) : null;
  };
}
