import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ColorResolvable } from 'discord.js';
import { db } from '../../database/db';
import { logger } from '../../utils/logger';

export const clanCommand = {
    data: new SlashCommandBuilder()
        .setName('clan')
        .setDescription('Franchise and Org operations')
        // (Omitted other subcommands for brevity, assume they are registered here exactly as before)
        .addSubcommand(s => s.setName('list').setDescription('View all registered clans'))
        .addSubcommand(s => s.setName('add').setDescription('Add a new clan (Creates Role)')
            .addStringOption(o => o.setName('name').setDescription('Clan Name').setRequired(true))
            .addUserOption(o => o.setName('franchise_owner').setDescription('The FO of this clan').setRequired(true))
            .addAttachmentOption(o => o.setName('logo').setDescription('Clan Logo image').setRequired(false))
            .addStringOption(o => o.setName('color').setDescription('Role Hex Color (e.g. #337def)').setRequired(false))
            .addAttachmentOption(o => o.setName('role_icon').setDescription('Custom Role Icon (Needs Boost Lvl 2)').setRequired(false))),

    async execute(interaction: ChatInputCommandInteraction) {
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply({ ephemeral: sub !== 'list' });

        try {
            if (sub === 'list') {
                const clans = await db.clan.findMany({ include: { _count: { select: { members: true } } } });
                const embed = new EmbedBuilder().setTitle('🛡️ OCL Registered Clans').setDescription(clans.length ? clans.map(c => `**${c.name}** — FO: <@${c.ownerId}> | Members: ${c._count.members}`).join('\n') : 'No clans are currently registered.').setColor('#337def');
                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'add') {
                const name = interaction.options.getString('name', true);
                const fo = interaction.options.getUser('franchise_owner', true);
                const logo = interaction.options.getAttachment('logo');
                const colorInput = interaction.options.getString('color');
                const roleIcon = interaction.options.getAttachment('role_icon');

                // 🛑 BOT CHECK
                if (fo.bot) return interaction.editReply('❌ Bots cannot be registered as Franchise Owners or players.');

                const exists = await db.clan.findUnique({ where: { name } });
                if (exists) return interaction.editReply(`❌ The clan **${name}** already exists.`);

                let parsedColor: ColorResolvable | undefined = undefined;
                if (colorInput) parsedColor = (colorInput.startsWith('#') ? colorInput : `#${colorInput}`) as ColorResolvable;

                let role;
                let roleMsg = '✅ Role created.';
                
                try {
                    // Try to create the role with everything
                    role = await interaction.guild?.roles.create({ name, color: parsedColor, icon: roleIcon?.url || logo?.url, reason: 'OCL Clan Creation' });
                } catch (e: any) {
                    // If it failed because of the icon (Boost Lvl 2), try again without the icon
                    if (e.message.includes('icon') || e.message.includes('Premium')) {
                        try {
                            role = await interaction.guild?.roles.create({ name, color: parsedColor, reason: 'OCL Clan (No Icon fallback)' });
                            roleMsg = '⚠️ Role created, but icon was skipped (Your server lacks Boost Level 2).';
                        } catch (fatal: any) {
                            logger.error(`Clan Role Creation Fallback (${name})`, fatal);
                            return interaction.editReply(`❌ Failed to create role. Error: \`${fatal.message}\`\n*(Make sure I have Manage Roles permission and my bot role is high up in the server settings)*`);
                        }
                    } else {
                        // General Error (like bad Color HEX, or missing permissions entirely)
                        logger.error(`Clan Role Creation (${name})`, e);
                        return interaction.editReply(`❌ Failed to create role. Error: \`${e.message}\`\n*(If you used a color, ensure it is a valid Hex code like #337def)*`);
                    }
                }

                if (role) {
                    try {
                        const member = await interaction.guild?.members.fetch(fo.id);
                        if (member) await member.roles.add(role);
                    } catch (e: any) {
                        logger.error(`Clan Role Assignment (${fo.username})`, e);
                        roleMsg += `\n⚠️ Failed to assign the role to <@${fo.id}>. Error: \`${e.message}\``;
                    }
                }

                await db.user.upsert({ where: { id: fo.id }, update: { clanId: null }, create: { id: fo.id } });
                const clan = await db.clan.create({ data: { name, ownerId: fo.id, logo: logo?.url || null, roleId: role?.id } });
                await db.user.update({ where: { id: fo.id }, data: { clanId: clan.id, clanRank: 'FO' } });

                return interaction.editReply(`✅ Clan **${name}** created.\n<@${fo.id}> is FO.\n${roleMsg}`);
            }

        } catch (error) {
            logger.error(`Clan Command: ${sub}`, error);
            return interaction.editReply('❌ A critical error occurred. Please download the error log via `/dev` to see details.');
        }
    }
};
