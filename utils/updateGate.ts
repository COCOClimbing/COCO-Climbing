// Resolves once the startup OTA update check has settled — either no update
// was found, the check/fetch failed, or a hard timeout elapsed. It is
// intentionally NOT resolved when an update was found and the app is about
// to reload via Updates.reloadAsync(): that tears down this whole JS
// context, so a fresh instance re-runs the check (and this gate) on the new
// bundle instead.
//
// Login-time cloud sync (see AuthContext.handleSyncOnLogin) awaits this
// before running, so a freshly reinstalled app — still running the OLD
// embedded bundle for the first few seconds — never executes destructive
// sync logic that's already been fixed in a pending OTA update. Without
// this gate, a fix like the cleanupOrphanedCloudRecords data-loss guard
// could ship via OTA and still lose data on the very next reinstall, because
// sync used to fire immediately on login while the update check ran several
// seconds later on a delay.
let resolve: () => void;
export const updateCheckSettled: Promise<void> = new Promise(r => { resolve = r; });

export function markUpdateCheckSettled(): void {
  resolve();
}

// Hard cap so a hung network call (checkForUpdateAsync/fetchUpdateAsync never
// resolving) can't block login sync indefinitely.
setTimeout(() => resolve(), 6000);
