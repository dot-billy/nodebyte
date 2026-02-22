importScripts("api.js");

const BOOKMARK_FOLDER_NAME = "Nodebyte";
const KIND_LABELS = { site: "Sites", service: "Services", device: "Devices", other: "Other" };

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SYNC_BOOKMARKS") {
    syncBookmarks();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  syncBookmarks();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes[STORAGE_KEYS.teamId]) {
    syncBookmarks();
  }
});

async function syncBookmarks() {
  const settings = await getSettings();
  if (!settings.accessToken || !settings.teamId) return;

  let nodes;
  try {
    nodes = await api.listNodes(settings.teamId, { limit: 200 });
  } catch {
    return;
  }

  const bookmarkableNodes = nodes.filter((n) => n.url);
  if (bookmarkableNodes.length === 0) {
    await clearBookmarkFolder();
    return;
  }

  const root = await getOrCreateRootFolder();

  const existingChildren = await chrome.bookmarks.getChildren(root.id);
  for (const child of existingChildren) {
    await chrome.bookmarks.removeTree(child.id);
  }

  const grouped = {};
  for (const node of bookmarkableNodes) {
    const kind = node.kind || "other";
    if (!grouped[kind]) grouped[kind] = [];
    grouped[kind].push(node);
  }

  const kindOrder = ["site", "service", "device", "other"];
  for (const kind of kindOrder) {
    const items = grouped[kind];
    if (!items || items.length === 0) continue;

    const folderName = KIND_LABELS[kind] || kind;
    const folder = await chrome.bookmarks.create({
      parentId: root.id,
      title: folderName,
    });

    for (const node of items) {
      await chrome.bookmarks.create({
        parentId: folder.id,
        title: node.name,
        url: node.url,
      });
    }
  }
}

async function getOrCreateRootFolder() {
  const settings = await getSettings();
  const teamLabel = settings.teamName || "Team";
  const folderTitle = `${BOOKMARK_FOLDER_NAME} — ${teamLabel}`;

  const otherBookmarks = await chrome.bookmarks.getTree();
  const bar = otherBookmarks[0].children[1];

  const existing = await chrome.bookmarks.getChildren(bar.id);
  for (const child of existing) {
    if (child.title.startsWith(BOOKMARK_FOLDER_NAME) && !child.url) {
      if (child.title !== folderTitle) {
        await chrome.bookmarks.update(child.id, { title: folderTitle });
      }
      return child;
    }
  }

  return chrome.bookmarks.create({
    parentId: bar.id,
    title: folderTitle,
  });
}

async function clearBookmarkFolder() {
  const otherBookmarks = await chrome.bookmarks.getTree();
  const bar = otherBookmarks[0].children[1];
  const existing = await chrome.bookmarks.getChildren(bar.id);
  for (const child of existing) {
    if (child.title.startsWith(BOOKMARK_FOLDER_NAME) && !child.url) {
      await chrome.bookmarks.removeTree(child.id);
    }
  }
}
