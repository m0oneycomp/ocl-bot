import { SlashCommandBuilder, ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, SectionBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, ThumbnailBuilder } from 'discord.js';
import { db } from '../../database/db';

export const matchCommand = {
    data: new SlashCommandBuilder()
        .setName('match')
        .setDescription('Core competitive match engine')
        .addSubcommand(s => s.setName('host').setDescription('Host a new match').addStringOption(o => o.setName('mode').setDescription('Match mode').setRequired(true).addChoices({ name: 'Ranked', value: 'ranked' }, { name: 'Casual', value: 'casual' })))
        .addSubcommand(s => s.setName('teams').setDescription('Generate balanced teams for your active match'))
        .addSubcommandGroup(g => g.setName('manage').setDescription('Host & Staff match management').addSubcommand(s => s.setName('end').setDescription('End the current match'))),

    async execute(interaction: ChatInputCommandInteraction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'host') {
            const mode = interaction.options.getString('mode', true);
            const existing = await db.league.findFirst({ where: { hostId: interaction.user.id, status: 'PENDING' } });
            if (existing) return interaction.reply({ content: '❌ You are already hosting an active queue.', ephemeral: true });

            const league = await db.league.create({ data: { hostId: interaction.user.id, channelId: interaction.channelId } });
            await interaction.reply({ content: '✅ Match queue successfully deployed.', ephemeral: true });

            const header = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# 🏆 OCL ${mode.charAt(0).toUpperCase() + mode.slice(1)} Queue`),
                    new TextDisplayBuilder().setContent(`**Host:** <@${interaction.user.id}>\n**Players Joined: 0/10**\n*Click below to enter the queue.*`),
                    new TextDisplayBuilder().setContent(`*Match ID: ${league.id}*`)
                );

            const banner = new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('https://i.imgur.com/KvxOH6m.png'));

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`join_match_${league.id}`).setLabel('Join Match').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`leave_match_${league.id}`).setLabel('Leave').setStyle(ButtonStyle.Danger)
            );

            await interaction.channel?.send({ components: [header, banner, row] as any[] });
        }

        if (sub === 'teams') {
            const league = await db.league.findFirst({ where: { hostId: interaction.user.id, status: 'PENDING' } });
            if (!league) return interaction.reply({ content: '❌ No pending match found.', ephemeral: true });
            const players = await db.user.findMany({ where: { activeLeague: league.id } });
            if (players.length < 2) return interaction.reply({ content: '❌ Not enough players.', ephemeral: true });

            const shuffled = players.sort(() => 0.5 - Math.random());
            const mid = Math.ceil(shuffled.length / 2);
            await interaction.reply({ content: '✅ Teams generated.', ephemeral: true });

            const teamsSection = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('# 🎲 Match Teams Generated'),
                    new TextDisplayBuilder().setContent(`**🔵 Team A**\n${shuffled.slice(0, mid).map(p => `<@${p.id}>`).join('\n') || 'Empty'}\n\n**🔴 Team B**\n${shuffled.slice(mid).map(p => `<@${p.id}>`).join('\n') || 'Empty'}`)
                )
                .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: 'https://i.imgur.com/f5LGesj.png' } }));

            await db.league.update({ where: { id: league.id }, data: { status: 'ACTIVE' } });
            await interaction.channel?.send({ content: `🚨 <@${league.hostId}>, your teams are ready!`, components: [teamsSection] as any[] });
        }
        
        if (sub === 'end') {
            const league = await db.league.findFirst({ where: { hostId: interaction.user.id, status: { in: ['PENDING', 'ACTIVE'] } } });
            if (!league) return interaction.reply({ content: '❌ No active match.', ephemeral: true });
            await db.user.updateMany({ where: { activeLeague: league.id }, data: { activeLeague: null } });
            await db.league.update({ where: { id: league.id }, data: { status: 'CLOSED' } });
            await interaction.reply({ content: '✅ Match closed.', ephemeral: true });
        }
    }
};
