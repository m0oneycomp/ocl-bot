import { db } from '../database/db';

export async function verifyUserRoblox(discordId: string, guildId: string, memberRoles: string[]): Promise<{ verified: boolean; message?: string }> {
    const settings = await db.settings.findUnique({ where: { id: 'global' } });
    
    // 1. Check Manual Override (Bypass if HiCom already set their username)
    const user = await db.user.findUnique({ where: { id: discordId } });
    if (user?.robloxId) return { verified: true, message: 'Verified via HiCom manual override.' };

    // 2. Check Global RoVer Toggle
    if (!settings?.roverEnabled) return { verified: true };

    // 3. HiCom Role Bypass
    const envHiCom = process.env.HICOM_ROLE_ID || '1525333690723471442'; 
    if ((settings?.hiComRoleId && memberRoles.includes(settings.hiComRoleId)) || memberRoles.includes(envHiCom)) {
        return { verified: true, message: 'HiCom Bypass Authorized.' };
    }

    // 4. API Request Check
    if (!settings?.roverApiKey) return { verified: false, message: 'RoVer API Key is missing in /settings.' };

    try {
        const response = await fetch(`https://registry.rover.link/api/guilds/${guildId}/discord-to-roblox/${discordId}`, {
            headers: { 'Authorization': `Bearer ${settings.roverApiKey}` }
        });

        if (response.status === 200) {
            return { verified: true };
        } else {
            return { verified: false, message: 'You must link your Roblox account via RoVer to play in OCL.' };
        }
    } catch (error) {
        return { verified: false, message: 'Error communicating with RoVer API. Try again later.' };
    }
}
