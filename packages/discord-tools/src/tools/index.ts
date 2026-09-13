// Importing each tool module runs its top-level registerTool() call.
// Add new tool files here as future phases introduce them — nothing
// else needs to change.
import "./listRoles.js";
import "./listChannels.js";
import "./serverInfo.js";
import "./createRole.js";
import "./addRoleToMember.js";

// Phase 2 — channels & categories
import "./createChannel.js";
import "./deleteChannel.js";
import "./renameChannel.js";
import "./moveChannel.js";
import "./createCategory.js";
import "./deleteCategory.js";
import "./editChannelPermissions.js";

// Phase 2 — roles
import "./deleteRole.js";
import "./renameRole.js";
import "./editRole.js";
import "./moveRole.js";
import "./removeRoleFromMember.js";
import "./bulkRemoveRole.js";

// Phase 2 — members
import "./listMembers.js";
import "./searchMembers.js";
import "./getMemberInfo.js";

// Phase 2 — stylish server system
import "./restyleNames.js";

// Phase 3 — moderation
import "./kickMember.js";
import "./banMember.js";
import "./unbanMember.js";
import "./timeoutMember.js";
import "./removeTimeout.js";
import "./listBans.js";
import "./getModerationTargetInfo.js";

// Phase 4 — Server Architect
import "./proposeServerPlan.js";
import "./modifyServerPlan.js";
import "./buildServerPlan.js";
import "./analyzeServer.js";
import "./configureTicketSystem.js";

// Bot lifecycle
import "./shutdownBot.js";

export {};
