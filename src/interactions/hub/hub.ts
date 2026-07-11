import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { db } from '../../database/db';

export const hubCommand = {
    data: new SlashCommandBuilder()
        .setName('hub')
        .setDescription('Player Profiles and Global Leaderboards')
        .addSubcommand(s => s.setName('profile').setDescription('View your OCL statistics').addUserOption(o => o.setName('user').setDescription('Target player')))
        .addSubcommand(s => s.setName('leaderboard').setDescription('View top OCL players'))
        .addSubcommand(s => s.setName('editstats').setDescription('Admin only: Edit player stats')
            .addUserOption(o => o.setName('user').setDescription('Target player').setRequired(true))
            .addIntegerOption(o => o.setName('elo').setDescription('New exact Elo').setRequired(true))
            .addIntegerOption(o => o.setName('points').setDescription('New exact Points').setRequired(true))),

    async execute(interaction: ChatInputCommandInteraction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'editstats') {
            if (!interaction.memberPermissions?.has('Administrator')) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
            const target = interaction.options.getUser('user', true);
            const elo = interaction.options.getInteger('elo', true);
            const points = interaction.options.getInteger('points', true);
            await db.user.upsert({ where: { id: target.id }, update: { elo, points }, create: { id: target.id, elo, points }});
            return interaction.reply({ content: `✅ <@${target.id}> stats updated. Elo: **${elo}**, Points: **${points}**`, ephemeral: true });
        }

        if (sub === 'profile') {
            const target = interaction.options.getUser('user') || interaction.user;
            const user = await db.user.upsert({ where: { id: target.id }, update: {}, create: { id: target.id }, include: { clan: true, matches: { include: { match: true } } } });

            const wins = user.matches.filter(m => m.win).length;
            const losses = user.matches.filter(m => !m.win).length;
            const totalGames = wins + losses;
            const winrate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
            const kills = user.matches.reduce((sum, m) => sum + m.kills, 0);
            const strikes = await db.strike.count({ where: { userId: user.id } });

            const embed = new EmbedBuilder()
                .setTitle(`📊 OCL Profile: ${target.username}`)
                .setThumbnail(target.displayAvatarURL())
                .setColor('#337def')
                .addFields(
                    { name: '🏆 Rating', value: `Elo: **${user.elo}**\nPoints: **${user.points}**`, inline: true },
                    { name: '⚔️ Combat', value: `Wins: **${wins}**\nLosses: **${losses}**\nWin Rate: **${winrate}%**\nTotal Kills: **${kills}**`, inline: true },
                    { name: '🛡️ Faction', value: user.clan ? `**${user.clan.name}** (${user.clanRank})` : '*No Clan*', inline: true },
                    { name: '⚠️ Standing', value: strikes > 0 ? `${strikes} Active Strikes` : 'Clean Record', inline: true }
                );

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'leaderboard') {
            const topPlayers = await db.user.findMany({ orderBy: { elo: 'desc' }, take: 10, include: { clan: true } });
            if (topPlayers.length === 0) return interaction.reply({ content: 'No data available.', ephemeral: true });

            const boardText = topPlayers.map((p, index) => {
                const clanTag = p.clan ? `[${p.clan.name}]` : '';
                return `**${index + 1}.** <@${p.id}> ${clanTag} — **${p.elo}** Elo`;
            }).join('\n\n');

            const embed = new EmbedBuilder()
                .setTitle('🏆 OCL Global Leaderboard')
                .setDescription(boardText)
                .setColor('#337def')
                .setThumbnail('https://i.imgur.com/f5LGesj.png')
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};
