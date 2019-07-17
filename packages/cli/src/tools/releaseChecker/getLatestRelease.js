/**
 * @flow
 */
import semver from 'semver';
import logger from '../logger';
import cacheManager from './releaseCacheManager';
import {fetch} from '@react-native-community/cli-tools';

export type Release = {
  version: string,
  changelogUrl: string,
};

/**
 * Checks via GitHub API if there is a newer stable React Native release and,
 * if it exists, returns the release data.
 *
 * If the latest release is not newer or if it's a prerelease, the function
 * will return undefined.
 */
export default async function getLatestRelease(
  name: string,
  currentVersion: string,
) {
  logger.debug('Checking for a newer version of React Native');
  try {
    logger.debug(`Current version: ${currentVersion}`);

    const cachedLatest = cacheManager.get(name, 'latestVersion');

    if (cachedLatest) {
      logger.debug(`Cached release version: ${cachedLatest}`);
    }

    const aWeek = 7 * 24 * 60 * 60 * 1000;
    const lastChecked = cacheManager.get(name, 'lastChecked');
    const now = new Date();
    if (lastChecked && now - new Date(lastChecked) < aWeek) {
      logger.debug('Cached release is still recent, skipping remote check');
      return;
    }

    logger.debug('Checking for newer releases on GitHub');
    const eTag = cacheManager.get(name, 'eTag');
    const latestVersion = await getLatestRnDiffPurgeVersion(name, eTag);
    logger.debug(`Latest release: ${latestVersion}`);

    if (
      semver.compare(latestVersion, currentVersion) === 1 &&
      !semver.prerelease(latestVersion)
    ) {
      return {
        version: latestVersion,
        changelogUrl: buildChangelogUrl(latestVersion),
      };
    }
  } catch (e) {
    logger.debug(
      'Something went wrong with remote version checking, moving on',
    );
    logger.debug(e);
  }
}

function buildChangelogUrl(version: string) {
  return `https://github.com/facebook/react-native/releases/tag/v${version}`;
}

/**
 * Returns the most recent React Native version available to upgrade to.
 */
async function getLatestRnDiffPurgeVersion(name: string, eTag: ?string) {
  const options = {
    // https://developer.github.com/v3/#user-agent-required
    headers: ({'User-Agent': 'React-Native-CLI'}: Headers),
  };

  if (eTag) {
    options.headers['If-None-Match'] = eTag;
  }

  const {data, status, headers} = await fetch(
    'https://api.github.com/repos/react-native-community/rn-diff-purge/tags',
    options,
  );

  // Remote is newer.
  if (status === 200) {
    const body: Array<any> = data;
    const latestVersion = body[0].name.substring(8);

    // Update cache only if newer release is stable.
    if (!semver.prerelease(latestVersion)) {
      const eTagHeader = headers.get('eTag');

      logger.debug(`Saving ${eTagHeader} to cache`);
      cacheManager.set(name, 'eTag', eTagHeader);
      cacheManager.set(name, 'latestVersion', latestVersion);
    }

    return latestVersion;
  }

  // Cache is still valid.
  if (status === 304) {
    const latestVersion = cacheManager.get(name, 'latestVersion');
    if (latestVersion) {
      return latestVersion;
    }
  }

  // Should be returned only if something went wrong.
  return '0.0.0';
}

type Headers = {
  'User-Agent': mixed,
  [header: string]: mixed,
};