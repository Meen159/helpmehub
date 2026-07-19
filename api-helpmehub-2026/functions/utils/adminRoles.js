const ADMIN_ROLE = Object.freeze({
    OWNER: 'OWNER',
    SUPER_ADMIN: 'SUPER_ADMIN',
    ADMIN: 'ADMIN'
});

const VALID_ADMIN_ROLES = Object.values(ADMIN_ROLE);

const normalizeAdminRole = (role) => {
    const normalizedRole = String(role || ADMIN_ROLE.ADMIN).trim().toUpperCase().replace(/\s+/g, '_');
    return VALID_ADMIN_ROLES.includes(normalizedRole) ? normalizedRole : ADMIN_ROLE.ADMIN;
};

const isOwner = (role) => normalizeAdminRole(role) === ADMIN_ROLE.OWNER;
const isSuperAdmin = (role) => normalizeAdminRole(role) === ADMIN_ROLE.SUPER_ADMIN;
const hasFullProjectAccess = (role) => isOwner(role) || isSuperAdmin(role);
const canCreateUsers = (role) => {
    const normalizedRole = normalizeAdminRole(role);
    return normalizedRole === ADMIN_ROLE.OWNER || normalizedRole === ADMIN_ROLE.SUPER_ADMIN || normalizedRole === ADMIN_ROLE.ADMIN;
};
const canCreateProjects = (role) => {
    const normalizedRole = normalizeAdminRole(role);
    return normalizedRole === ADMIN_ROLE.OWNER || normalizedRole === ADMIN_ROLE.SUPER_ADMIN;
};
const canManageProjects = (role) => isOwner(role);
const canManageConversationAssignments = (role) => {
    const normalizedRole = normalizeAdminRole(role);
    return normalizedRole === ADMIN_ROLE.OWNER || normalizedRole === ADMIN_ROLE.SUPER_ADMIN || normalizedRole === ADMIN_ROLE.ADMIN;
};
const canEditConversationNicknames = (role) => {
    const normalizedRole = normalizeAdminRole(role);
    return normalizedRole === ADMIN_ROLE.OWNER || normalizedRole === ADMIN_ROLE.SUPER_ADMIN || normalizedRole === ADMIN_ROLE.ADMIN;
};

const canManageTargetUser = (actorRole, targetRole) => {
    const normalizedActorRole = normalizeAdminRole(actorRole);
    const normalizedTargetRole = normalizeAdminRole(targetRole);

    if (normalizedActorRole === ADMIN_ROLE.OWNER) {
        return normalizedTargetRole !== ADMIN_ROLE.OWNER;
    }

    if (normalizedActorRole === ADMIN_ROLE.SUPER_ADMIN) {
        return normalizedTargetRole === ADMIN_ROLE.ADMIN;
    }

    if (normalizedActorRole === ADMIN_ROLE.ADMIN) {
        return normalizedTargetRole === ADMIN_ROLE.ADMIN;
    }

    return false;
};

module.exports = {
    ADMIN_ROLE,
    normalizeAdminRole,
    isOwner,
    isSuperAdmin,
    hasFullProjectAccess,
    canCreateUsers,
    canCreateProjects,
    canManageProjects,
    canManageConversationAssignments,
    canEditConversationNicknames,
    canManageTargetUser
};