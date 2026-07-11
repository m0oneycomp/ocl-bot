import { db } from '../database/db';

export async function verifyPlayer(discordId: string, guildId: string, memberRoles: string[]): Promise<{ verified: boolean; message?: string }> {
    const settings = await db.settings.findUnique({ where: { id: 'global' } });
    
    // 1. HiCom Bypass or Manual DB Override
    const user = await db.user.findUnique({ where: { id: discordId } });
    if (user?.robloxId) return { verified: true, message: 'Verified via HiCom manual override.' };

    const envHiCom = process.env.HICOM_ROLE_ID || '1525333690723471442'; 
    if ((settings?.hiComRoleId && memberRoles.includes(settings.hiComRoleId)) || memberRoles.includes(envHiCom)) {
        return { verified: true, message: 'HiCom Bypass Authorized.' };
    }

    // 2. Community Verify Check (Custom Server Role)
    if (settings?.communityVerifyEnabled) {
        if (!settings.communityVerifyRoleId) return { verified: false, message: 'Community Verify is required, but the Role ID is missing in /settings.' };
        if (!memberRoles.includes(settings.communityVerifyRoleId)) return { verified: false, message: 'You must pass Community Verification (get the required role) to play.' };
    }

    // 3. Bloxlink API Check
    if (settings?.bloxlinkEnabled) {
        if (!settings.bloxlinkApiKey) return { verified: false, message: 'Bloxlink is required, but API key is missing in /settings.' };
        try {
            const res = await fetch(`https://api.blox.link/v4/public/guilds/${guildId}/discord-to-roblox/${discordId}`, {
                headers: { 'Authorization': settings.bloxlinkApiKey } // Bloxlink uses raw key
            });
            if (res.status !== 200) return { verified: false, message: 'You must link your Roblox account via Bloxlink.' };
        } catch (e) { return { verified: false, message: 'Error reaching Bloxlink API.' }; }
    }

    // 4. RoVer API Check
    if (settings?.roverEnabled) {
        if (!settings.roverApiKey) return { verified: false, message: 'RoVer is required, but API key is missing in /settings.' };
        try {
            const res = await fetch(`https://registry.rover.link/api/guilds/${guildId}/discord-to-roblox/${discordId}`, {
                headers: { 'Authorization': `Bearer ${settings.roverApiKey}` } // RoVer uses Bearer
            });
            if (res.status !== 200) return { verified: false, message: 'You must link your Roblox account via RoVer.' };
        } catch (e) { return { verified: false, message: 'Error reaching RoVer API.' }; }
    }

    return { verified: true };
}
