import { test, suite } from "uvu";
import * as assert from "uvu/assert";
import { getAddCacheToSetupNodeFunction } from "../../utils/yaml-parser.js";
import fs from "fs";

const getDirs = (source) =>
  fs
    .readdirSync(source, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory());

const pendingCacheFixturesPath =
  "./tests/utils/github-action-fixtures/pending-to-add-cache";
const cacheSuite = suite("Add cache step with 'npm'");
const cachePendingToAddExamples = getDirs(pendingCacheFixturesPath);

for (const example of cachePendingToAddExamples) {
  cacheSuite(`for ${example.name}`, () => {
    const actualFileContent = fs.readFileSync(
      `${pendingCacheFixturesPath}/${example.name}/actual.yml`,
      { encoding: "utf8", flag: "r" }
    );

    const expectedFileContent = fs.readFileSync(
      `${pendingCacheFixturesPath}/${example.name}/expected.yml`,
      { encoding: "utf8", flag: "r" }
    );

    assert.is(
      getAddCacheToSetupNodeFunction("npm")({
        content: actualFileContent,
        encoding: "utf-8",
      }),
      expectedFileContent
    );
  });
}

cacheSuite.run();

const hasCacheFixturesPath =
  "./tests/utils/github-action-fixtures/already-has-cache";
const cacheSuiteAlreadySet = suite("Cache step is already added");
const cacheAlreadySetExamples = getDirs(hasCacheFixturesPath);

for (const example of cacheAlreadySetExamples) {
  cacheSuiteAlreadySet(`for ${example.name}`, () => {
    const actualFileContent = fs.readFileSync(
      `${hasCacheFixturesPath}/${example.name}/actual.yml`,
      { encoding: "utf8", flag: "r" }
    );

    assert.is(
      getAddCacheToSetupNodeFunction("npm")({
        content: actualFileContent,
        encoding: "utf-8",
      }),
      null
    );
  });
}

cacheSuiteAlreadySet.run();
