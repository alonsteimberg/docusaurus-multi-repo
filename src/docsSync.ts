// scripts/fetch-docs.ts
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import { exec as execCb } from "child_process";
import { promisify } from "util";

const exec = promisify(execCb);

interface RepositoriesConfig {
  collections: CollectionConfig[];
}

interface CollectionConfig {
  collectionName: string;
  repos: RepoConfig[];
}

interface RepoConfig {
  title: string;
  baseUrl: string;
  path: string;
  targetDir: string | null;
}

const CONFIG_FILE = "repositories.json";
const LOCAL_DOCS_DIR = "docs";

async function loadReposConfig(): Promise<RepositoriesConfig> {
  const content = await fs.readFile(CONFIG_FILE, "utf-8");
  return JSON.parse(content) as RepositoriesConfig;
}

async function cloneRepo(repo: RepoConfig, targetDir: string): Promise<void> {
  console.log(`start Cloning base ${repo.baseUrl} into ${targetDir}...`);
  await exec(`git clone --depth 1 ${repo.baseUrl} ${targetDir}`);
  console.log(`finish Cloning base ${repo.baseUrl} into ${targetDir}...`);
}

async function copyDocs(repo: RepoConfig, collectionName: string, tempDir: string): Promise<void> {
  const sourceDocsDir = tempDir + repo.path;
  console.log(`start copy ${sourceDocsDir}`)
  const targetDocsDir = path.join(process.cwd(), LOCAL_DOCS_DIR, collectionName, repo.targetDir != null ? repo.targetDir : "", repo.title);

  try {
    await fs.access(sourceDocsDir); // check if docs folder exists
  } catch {
    console.warn(`No "${repo.path}" directory found in ${repo.title}, skipping.`);
    return;
  }

  await fs.mkdir(targetDocsDir, { recursive: true });

  // recursive copy
  async function copyRecursive(src: string, dest: string) {
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await copyRecursive(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  await copyRecursive(sourceDocsDir, targetDocsDir);
  console.log(`Copied docs for ${repo.title} into ${targetDocsDir}`);
}

async function main() {
  // load configuration from file
  const repositoriesConfig: RepositoriesConfig = await loadReposConfig();
  const collections: CollectionConfig[] = repositoriesConfig.collections;
  // copy all colletcions 
  for (const collection of collections) {
    for (const repo of collection.repos) {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `${collection.collectionName}-`));

      try {
        await cloneRepo(repo, tempDir);
        await copyDocs(repo, collection.collectionName, tempDir);
      }
      catch {
        console.log("error clone/copy repo -> " + repo.title)
      }
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  console.log("All done!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
