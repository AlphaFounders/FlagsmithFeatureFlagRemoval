const core = require("@actions/core");
const getGithubConfigFlags = require("./github");
const flagsmithAPI = require("./flagsmith");
const slackAPI = require("./slack");

// most @actions toolkit packages have async methods
async function run() {
  try {
    const FLAGSMITHBASEURL = "https://api.flagsmith.com/api/v1";

    // secrets
    const githubAuth = core.getInput("access_token");
    const flagsmithToken = core.getInput("apitokenflagsmith");

    // github context
    const ownerRepo = core.getInput("ownerrepo");

    // matrix
    const flagsmithProjectId = core.getInput("flagsmithprojectid");
    const path = core.getInput("path");
    const ref = core.getInput("ref");
    const sendMessage = core.getInput("sendmessage");
    const slackWebhook = core.getInput("slackwebhook");

    // config
    const dryRun = core.getBooleanInput("dryrun");

    const flagsmithUrl = `${FLAGSMITHBASEURL}/projects/${flagsmithProjectId}/features/`;
    var flagsReadyToArchive = [];
    var archivedFlags = [];
    var flagsReadyToDelete = [];
    var deletedFlags = [];

    const githubFlags = await getGithubConfigFlags(
      githubAuth,
      ownerRepo,
      path,
      ref
    );

    const flagsmithFlags = await flagsmithAPI.getFlagsmithFlags(
      flagsmithUrl,
      flagsmithToken
    );

    flagsReadyToDelete = await flagsmithAPI.getArchivedFlags(
      flagsmithUrl,
      flagsmithToken
    );

    if (typeof flagsmithFlags !== "undefined") {
      for (const key in flagsmithFlags) {
        if (Object.hasOwnProperty.call(flagsmithFlags, key)) {
          const element = flagsmithFlags[key];
          if (typeof githubFlags === "undefined") {
            flagsReadyToArchive.push(element);
          } else if (!githubFlags.includes(element.name)) {
            flagsReadyToArchive.push(element);
            core.info(`flag ready to archive ${element.name}`);
          } else {
            core.info(`flag still exists on both places ${element.name}`);
          }
        }
      }
    }

    for (const key in flagsReadyToArchive) {
      if (Object.hasOwnProperty.call(flagsReadyToArchive, key)) {
        const flag = flagsReadyToArchive[key];
        core.info(`Flags ready to archive: ${flag.name} - ${flag.id}`);
        if (dryRun === false) {
          const response = await flagsmithAPI.archiveFlag(
            flagsmithUrl,
            flagsmithToken,
            flag.id
          );
          core.info(response);
        }
        archivedFlags.push(flag.name);
      }
    }

    var date = new Date();
    date.setDate(date.getDate() - 7);

    if (flagsReadyToDelete) {
      for (const key in flagsReadyToDelete) {
        if (Object.hasOwnProperty.call(flagsReadyToDelete, key)) {
          const flag = flagsReadyToDelete[key];
          const createdDate = new Date(flag.created_date);
          if (createdDate < date && dryRun === false) {
            try {
              const res = await flagsmithAPI.deleteFlag(
                flagsmithUrl,
                flagsmithToken,
                flag.id
              );
              core.info(`Deleted flag: ${flag.name} - ${res}`);
              deletedFlags.push(flag.name);
            } catch (err) {
              core.error(`Error deleting flag ${flag.name}: ${err.message}`);
            }
          }
        }
      }
    }

    if (sendMessage) {
      let message = "";
      message = slackAPI.createMessage(
        deletedFlags,
        archivedFlags,
        ref,
        dryRun
      );

      if (message != "") {
        await slackAPI.sendMessage(message, slackWebhook);
      }
    }

    core.info("Done");
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
