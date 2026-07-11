import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { db } from '../../database/db';

export const hicomCommand = {
    data: new SlashCommandBuilder()
        .setName('hicom')
        .setDescription('High Command Utilities')
        .addSubcommand(s => s.setName('setroblox')
            .setDescription('Manually link a Roblox username to a Discord account (Bypasses RoVer)')
            .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
            .addStringOption(o => o.setName('username').setDescription('Exact Roblox Username').setRequired(true))),

    async execute(interaction: ChatInputCommandInteraction) {
        const settings = await db.settings.findUnique({ where: { id: 'global' } });
        const memberRoles = (interaction.member as any).roles.cache.map((r: any) => r.id);
        const envHiCom = process.env.HICOM_ROLE_ID || '1525333690723471442';
        
        const isHiCom = interaction.memberPermissions?.has('Administrator') || 
                        (settings?.hiComRoleId && memberRoles.includes(settings.hiComRoleId)) || 
                        memberRoles.includes(envHiCom);

        if (!isHiCom) return interaction.reply({ content: '⛔ Unauthorized. You must be High Command to use this.', ephemeral: true });

        const sub = interaction.options.getSubcommand();

        if (sub === 'setroblox') {
            const target = interaction.options.getUser('user', true);
            const username = interaction.options.getString('username', true);

            await db.user.upsert({
                where: { id: target.id },
                update: { robloxId: username },
                create: { id: target.id, robloxId: username }
            });

            return interaction.reply({ content: `✅ Successfully linked **${username}** to <@${target.id}>.\nThey will now completely bypass RoVer restrictions.` });
        }
    }
};
