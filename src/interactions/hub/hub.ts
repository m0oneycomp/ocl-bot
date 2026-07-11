import { SlashCommandBuilder, ChatInputCommandInteraction, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, SeparatorBuilder, ContainerBuilder, MessageFlags } from 'discord.js';
import { db } from '../../database/db';

export const hubCommand = {
    data: new SlashCommandBuilder()
        .setName('hub')
        .setDescription('Player Profiles and Global Leaderboards')
        .addSubcommand(s => s.setName('profile').setDescription('View your OCL statistics').addUserOption(o => o.setName('user').setDescription('Target player')))
        .addSubcommand(s => s.setName('leaderboard').setDescription('View top OCL players')),

    async execute(interaction: ChatInputCommandInteraction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'profile') {
            const target = interaction.options.getUser('user') || interaction.user;
            const user = await db.user.upsert({ where: { id: target.id }, update: {}, create: { id: target.id }, include: { clan: true, matches: { include: { match: true } } } });

            const wins = user.matches.filter(m => m.win).length;
            const losses = user.matches.filter(m => !m.win).length;
            const totalGames = wins + losses;
            const winrate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
            const kills = user.matches.reduce((sum, m) => sum + m.kills, 0);
            const strikes = await db.strike.count({ where: { userId: user.id } });

            const container = new ContainerBuilder()
                .setAccentColor(0x337DEF)
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 📊 Profile: ${target.username}`))
                        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: target.displayAvatarURL() } }))
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**🏆 Rating:** Elo: ${user.elo} | Points: ${user.points}`),
                    new TextDisplayBuilder().setContent(`**⚔️ Combat:** Wins: ${wins} | Losses: ${losses} | WR: ${winrate}% | Kills: ${kills}`),
                    new TextDisplayBuilder().setContent(`**🛡️ Faction:** ${user.clan ? `${user.clan.name} (${user.clanRank})` : '*No Clan*'}`),
                    new TextDisplayBuilder().setContent(`**⚠️ Standing:** ${strikes > 0 ? `${strikes} Active Strikes` : 'Clean Record'}`)
                );

            return interaction.reply({ components: [container] as any[], flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
        }

        if (sub === 'leaderboard') {
            const topPlayers = await db.user.findMany({ orderBy: { elo: 'desc' }, take: 10, include: { clan: true } });
            if (topPlayers.length === 0) return interaction.reply({ content: 'No data available.', ephemeral: true });

            const boardText = topPlayers.map((p, index) => {
                const clanTag = p.clan ? `[${p.clan.name}]` : '';
                return `**${index + 1}.** <@${p.id}> ${clanTag} — **${p.elo}** Elo`;
            }).join('\n');

            const container = new ContainerBuilder()
                .setAccentColor(0x337DEF)
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent('# 🏆 OCL Global Leaderboard'),
                            new TextDisplayBuilder().setContent(boardText)
                        )
                        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: 'https://i.imgur.com/f5LGesj.png' } }))
                );

            return interaction.reply({ components: [container] as any[], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
