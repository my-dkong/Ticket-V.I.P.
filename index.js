// Copyrights for Annaëg //

import discord from 'discord.js';
const { Client, IntentsBitField, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType, AttachmentBuilder, InteractionResponseFlags } = discord;

import fs from 'fs/promises';
import path from 'path';

const GOLD_COLOR = '#FFD700';
const VIP_ROLE_ID = '1331277163684429844';

// Configuration persistante pour les tickets
const CONFIG_FILE = './ticket_config.json';
let ticketConfig = {
    channelId: null,
    categoryId: null,
    staffRoleId: null,
    logChannelId: null,
    welcomeMessage: 'Bienvenue dans votre ticket V.I.P Luxe Suprême! Notre staff d’élite est à votre service.',
    ticketCounter: 0,
    ticketCategories: {
        support: { name: 'Support Général', emoji: '❓' },
        billing: { name: 'Facturation', emoji: '💰' },
        report: { name: 'Signalement', emoji: '🚨' }
    },
    priorityLevels: ['Low', 'Medium', 'High']
};

// Configuration anti-raid par défaut
const ANTI_RAID_DEFAULT = {
    messageThreshold: 10,
    messageTimeFrame: 10000,
    channelThreshold: 5,
    channelTimeFrame: 60000,
    joinThreshold: 10,
    joinTimeFrame: 300000,
    muteDuration: 3600000,
    messageDeleteTimeFrame: 120000,
    enabled: false
};

// Stockage des configurations anti-raid par serveur
const antiRaidConfigs = new Map();

// Données dynamiques pour la détection de raid (déclarée ici pour être globale)
const raidDetection = {
    messages: new Map(),
    channels: new Map(),
    joins: []
};

// Dossier pour les configurations par serveur
const ANTI_RAID_CONFIG_DIR = './anti_raid_configs';
// Vérification et création du dossier avec try/catch
try {
    await fs.access(ANTI_RAID_CONFIG_DIR);
} catch {
    await fs.mkdir(ANTI_RAID_CONFIG_DIR);
}

// Fonction pour normaliser l'ID en un nom de fichier valide
function normalizeFileName(guildId) {
    // Remplace les caractères non valides par un underscore et limite la longueur
    return guildId.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50) + '.json';
}

// Fonction pour obtenir le chemin du fichier de configuration d’un serveur
function getAntiRaidConfigFile(guildId) {
    const normalizedId = normalizeFileName(guildId);
    return path.join(ANTI_RAID_CONFIG_DIR, normalizedId);
}

// Chargement de la configuration anti-raid pour un serveur
async function loadAntiRaidConfig(guildId) {
    const filePath = getAntiRaidConfigFile(guildId);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        antiRaidConfigs.set(guildId, { ...ANTI_RAID_DEFAULT, ...JSON.parse(data) });
    } catch (err) {
        // Si le fichier n’existe pas, utiliser les valeurs par défaut
        antiRaidConfigs.set(guildId, { ...ANTI_RAID_DEFAULT });
    }
}

// Sauvegarde de la configuration anti-raid pour un serveur
async function saveAntiRaidConfig(guildId) {
    const filePath = getAntiRaidConfigFile(guildId);
    const config = antiRaidConfigs.get(guildId) || { ...ANTI_RAID_DEFAULT };
    await fs.writeFile(filePath, JSON.stringify(config, null, 2));
}

// Chargement/Sauvegarde config tickets
async function loadConfig() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        ticketConfig = { ...ticketConfig, ...JSON.parse(data) };
    } catch (err) {
        console.log('Aucune config existante pour les tickets, création nouvelle.');
    }
}

async function saveConfig() {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(ticketConfig, null, 2));
}

// Création de l'instance Client
const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildMessageReactions,
        IntentsBitField.Flags.GuildBans
    ]
});

client.once('ready', async () => {
    await loadConfig();
    // Charger les configurations anti-raid pour chaque serveur au démarrage
    for (const guild of client.guilds.cache.values()) {
        await loadAntiRaidConfig(guild.id);
    }
    console.log('Ticket V.I.P Luxe Suprême est en ligne avec protection anti-raid!');
    registerCommands();
});

function registerCommands() {
    const commands = [
        new SlashCommandBuilder()
            .setName('config')
            .setDescription('Configurer le système V.I.P Luxe Suprême')
            .addChannelOption(option => option.setName('channel').setDescription('Salon panel').setRequired(true))
            .addChannelOption(option => option.setName('category').setDescription('Catégorie tickets').setRequired(true))
            .addRoleOption(option => option.setName('staff').setDescription('Rôle staff').setRequired(true))
            .addStringOption(option => option.setName('message').setDescription('Message bienvenue').setRequired(false))
            .addChannelOption(option => option.setName('logs').setDescription('Salon logs').setRequired(false)),

        new SlashCommandBuilder()
            .setName('panels')
            .setDescription('Panels V.I.P Luxe Suprême'),

        new SlashCommandBuilder()
            .setName('help')
            .setDescription('Aide V.I.P Luxe Suprême'),

        new SlashCommandBuilder()
            .setName('transcript')
            .setDescription('Transcript ticket fermé')
            .addStringOption(option => option.setName('ticket_id').setDescription('ID ticket').setRequired(true)),

        new SlashCommandBuilder()
            .setName('stats')
            .setDescription('Statistiques tickets V.I.P'),

        new SlashCommandBuilder()
            .setName('anti-raid')
            .setDescription('Vérifier l’état de la protection anti-raid')
    ];

    client.application.commands.set(commands);
}

function isVipMember(member) {
    return member.roles.cache.has(VIP_ROLE_ID);
}

async function logAction(guild, title, description, files = []) {
    const logChannel = guild.channels.cache.get(ticketConfig.logChannelId);
    if (!logChannel) return;

    const logEmbed = new EmbedBuilder()
        .setColor(GOLD_COLOR)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();

    await logChannel.send({ embeds: [logEmbed], files });
}

// Fonctions anti-raid avec exclusion des administrateurs
async function handleRaidDetection(guild, type, userId) {
    const antiRaidConfig = antiRaidConfigs.get(guild.id) || ANTI_RAID_DEFAULT;
    if (!antiRaidConfig.enabled) return;

    const now = Date.now();
    const member = guild.members.cache.get(userId);

    // Ignorer les membres avec permissions administrateur
    if (member && member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    if (type === 'message') {
        let userData = raidDetection.messages.get(userId) || { count: 0, lastReset: now };
        if (now - userData.lastReset > antiRaidConfig.messageTimeFrame) {
            userData = { count: 0, lastReset: now };
        }
        userData.count++;
        raidDetection.messages.set(userId, userData);

        if (userData.count >= antiRaidConfig.messageThreshold) {
            if (member && !member.user.bot) {
                // Supprimer les messages des 2 dernières minutes
                for (const channel of guild.channels.cache.filter(ch => ch.isTextBased())) {
                    try {
                        const messages = await channel.messages.fetch({ limit: 100 });
                        const recentMessages = messages.filter(m => m.author.id === userId && (now - m.createdTimestamp) <= antiRaidConfig.messageDeleteTimeFrame);
                        if (recentMessages.size > 0) {
                            await channel.bulkDelete(recentMessages);
                        }
                    } catch (error) {
                        console.error(`Erreur lors de la suppression des messages dans ${channel.name}:`, error);
                    }
                }

                // Mute l'utilisateur pendant 1 heure
                await member.timeout(antiRaidConfig.muteDuration, 'Spam de messages détecté (Anti-Raid)');
                await logAction(guild, 'Raid Détecté - Mute', `Utilisateur <@${userId}> muté pour 1h pour spam (${userData.count} messages en ${antiRaidConfig.messageTimeFrame/1000}s) - Messages récents supprimés`);
                raidDetection.messages.delete(userId);
            }
        }
    }

    if (type === 'channel') {
        let channelData = raidDetection.channels.get(userId) || { count: 0, lastReset: now };
        if (now - channelData.lastReset > antiRaidConfig.channelTimeFrame) {
            channelData = { count: 0, lastReset: now };
        }
        channelData.count++;
        raidDetection.channels.set(userId, channelData);

        if (channelData.count >= antiRaidConfig.channelThreshold) {
            if (member && !member.user.bot) {
                // Supprimer les messages des 2 dernières minutes
                for (const channel of guild.channels.cache.filter(ch => ch.isTextBased())) {
                    try {
                        const messages = await channel.messages.fetch({ limit: 100 });
                        const recentMessages = messages.filter(m => m.author.id === userId && (now - m.createdTimestamp) <= antiRaidConfig.messageDeleteTimeFrame);
                        if (recentMessages.size > 0) {
                            await channel.bulkDelete(recentMessages);
                        }
                    } catch (error) {
                        console.error(`Erreur lors de la suppression des messages dans ${channel.name}:`, error);
                    }
                }

                // Mute l'utilisateur pendant 1 heure
                await member.timeout(antiRaidConfig.muteDuration, 'Création massive de channels (Anti-Raid)');
                await logAction(guild, 'Raid Détecté - Mute', `Utilisateur <@${userId}> muté pour 1h pour création massive (${channelData.count} channels en ${antiRaidConfig.channelTimeFrame/1000}s) - Messages récents supprimés`);
                raidDetection.channels.delete(userId);
            }
        }
    }
}

async function handleMassJoin(guild) {
    const antiRaidConfig = antiRaidConfigs.get(guild.id) || ANTI_RAID_DEFAULT;
    if (!antiRaidConfig.enabled) return;

    const now = Date.now();
    raidDetection.joins = raidDetection.joins.filter(timestamp => now - timestamp < antiRaidConfig.joinTimeFrame);

    if (raidDetection.joins.length >= antiRaidConfig.joinThreshold) {
        await guild.setVerificationLevel('HIGH', 'Raid détecté - Augmentation niveau vérification');
        await logAction(guild, 'Raid Détecté - Joins Massifs', `${raidDetection.joins.length} nouveaux membres en ${antiRaidConfig.joinTimeFrame/60000}min - Vérification élevée activée`);
        
        const publicChannels = guild.channels.cache.filter(ch => ch.type === ChannelType.GuildText && ch.permissionsFor(guild.roles.everyone).has(PermissionsBitField.Flags.ViewChannel));
        for (const channel of publicChannels.values()) {
            await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
        }
    }
}

// Surveillance des messages pour anti-raid et commandes préfixées
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // Surveillance anti-raid
    await handleRaidDetection(message.guild, 'message', message.author.id);

    // Commandes préfixées pour anti-raid
    if (message.content === '!active-anti-raid') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({ content: 'Administrateur requis!', flags: [InteractionResponseFlags.Ephemeral] });
        }
        const antiRaidConfig = antiRaidConfigs.get(message.guild.id) || { ...ANTI_RAID_DEFAULT };
        antiRaidConfig.enabled = true;
        antiRaidConfigs.set(message.guild.id, antiRaidConfig);
        await saveAntiRaidConfig(message.guild.id);
        const activateEmbed = new EmbedBuilder()
            .setColor(GOLD_COLOR)
            .setTitle('Protection Anti-Raid')
            .setDescription('L’anti-raid est maintenant **Activé**');
        await message.reply({ embeds: [activateEmbed] });
        await logAction(message.guild, 'Anti-Raid Activé', `Activé par ${message.author.tag}`);
    }

    if (message.content === '!desactive-anti-raid') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({ content: 'Administrateur requis!', flags: [InteractionResponseFlags.Ephemeral] });
        }
        const antiRaidConfig = antiRaidConfigs.get(message.guild.id) || { ...ANTI_RAID_DEFAULT };
        antiRaidConfig.enabled = false;
        antiRaidConfigs.set(message.guild.id, antiRaidConfig);
        await saveAntiRaidConfig(message.guild.id);
        const deactivateEmbed = new EmbedBuilder()
            .setColor(GOLD_COLOR)
            .setTitle('Protection Anti-Raid')
            .setDescription('L’anti-raid est maintenant **Désactivé**');
        await message.reply({ embeds: [deactivateEmbed] });
        await logAction(message.guild, 'Anti-Raid Désactivé', `Désactivé par ${message.author.tag}`);
    }
});

// Surveillance des créations de channels
client.on('channelCreate', async channel => {
    const auditLogs = await channel.guild.fetchAuditLogs({ type: 10, limit: 1 });
    const entry = auditLogs.entries.first();
    if (entry && (Date.now() - entry.createdTimestamp < 5000)) {
        await handleRaidDetection(channel.guild, 'channel', entry.executor.id);
    }
});

// Surveillance des nouveaux membres
client.on('guildMemberAdd', async member => {
    raidDetection.joins.push(Date.now());
    await handleMassJoin(member.guild);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand() && !interaction.isStringSelectMenu() && !interaction.isButton()) return;

    if (interaction.isCommand() && !isVipMember(interaction.member)) {
        const noVipEmbed = new EmbedBuilder()
            .setColor(GOLD_COLOR)
            .setTitle('Accès V.I.P Luxe Suprême Requis')
            .setDescription('Commande réservée aux V.I.P d’élite!');
        return interaction.reply({ embeds: [noVipEmbed], flags: [InteractionResponseFlags.Ephemeral] });
    }

    if (interaction.commandName === 'anti-raid') {
        const antiRaidConfig = antiRaidConfigs.get(interaction.guild.id) || ANTI_RAID_DEFAULT;
        const antiRaidEmbed = new EmbedBuilder()
            .setColor(GOLD_COLOR)
            .setTitle('État de la Protection Anti-Raid')
            .setDescription(`L’anti-raid est actuellement **${antiRaidConfig.enabled ? 'Activé' : 'Désactivé'}**`)
            .setFooter({ text: 'Utilisez /help pour plus d’infos' });

        await interaction.reply({ embeds: [antiRaidEmbed], flags: [InteractionResponseFlags.Ephemeral] });
    }

    if (interaction.commandName === 'config') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'Administrateur requis!', flags: [InteractionResponseFlags.Ephemeral] });
        }

        const channel = interaction.options.getChannel('channel');
        const category = interaction.options.getChannel('category');
        const staffRole = interaction.options.getRole('staff');
        const welcomeMsg = interaction.options.getString('message') || ticketConfig.welcomeMessage;
        const logChannel = interaction.options.getChannel('logs') || null;

        ticketConfig = {
            ...ticketConfig,
            channelId: channel.id,
            categoryId: category.id,
            staffRoleId: staffRole.id,
            welcomeMessage: welcomeMsg,
            logChannelId: logChannel ? logChannel.id : ticketConfig.logChannelId
        };

        await saveConfig();

        const configEmbed = new EmbedBuilder()
            .setColor(GOLD_COLOR)
            .setTitle('Configuration V.I.P Luxe Suprême')
            .setDescription('Système d’élite configuré!')
            .addFields(
                { name: 'Panel', value: `<#${channel.id}>`, inline: true },
                { name: 'Catégorie', value: `<#${category.id}>`, inline: true },
                { name: 'Staff', value: `<@&${staffRole.id}>`, inline: true },
                { name: 'Logs', value: ticketConfig.logChannelId ? `<#${ticketConfig.logChannelId}>` : 'Non défini', inline: true },
                { name: 'Message', value: welcomeMsg }
            );

        await interaction.reply({ embeds: [configEmbed], flags: [InteractionResponseFlags.Ephemeral] });

        const ticketPanelEmbed = new EmbedBuilder()
            .setColor(GOLD_COLOR)
            .setTitle('✨ Ticket V.I.P Luxe Suprême')
            .setDescription('Service d’élite – Sélectionnez votre catégorie ci-dessous!')
            .setFooter({ text: 'Ticket V.I.P - Expérience Suprême' });

        const categoryMenu = new StringSelectMenuBuilder()
            .setCustomId('select_ticket_category')
            .setPlaceholder('Choisir une catégorie')
            .addOptions(Object.entries(ticketConfig.ticketCategories).map(([id, { name, emoji }]) => ({
                label: name,
                value: id,
                emoji
            })));

        const row = new ActionRowBuilder().addComponents(categoryMenu);

        await channel.send({ embeds: [ticketPanelEmbed], components: [row] });
        await logAction(interaction.guild, 'Configuration Suprême', `Par ${interaction.user.tag}`);
    }

    if (interaction.commandName === 'panels') {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('vip_panel_select')
            .setPlaceholder('Panel V.I.P Luxe Suprême')
            .addOptions(
                { label: 'Ticket V.I.P', description: 'Panel tickets', value: 'vip_ticket_panel', emoji: '✨' },
                { label: 'Publicité Luxe', description: 'Infos bot', value: 'vip_bot_ad', emoji: '📢' }
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        const panelEmbed = new EmbedBuilder()
            .setColor(GOLD_COLOR)
            .setTitle('Panels V.I.P Luxe Suprême')
            .setDescription('Options d’élite');

        await interaction.reply({ embeds: [panelEmbed], components: [row], flags: [InteractionResponseFlags.Ephemeral] });
    }

    if (interaction.commandName === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor(GOLD_COLOR)
            .setTitle('Aide - Ticket V.I.P Luxe Suprême')
            .setDescription('Commandes d’élite (V.I.P requis):')
            .addFields(
                { name: '/config', value: 'Configure système\n- channel\n- category\n- staff\n- message\n- logs\n*Admin + V.I.P*' },
                { name: '/panels', value: 'Panels suprêmes' },
                { name: '/help', value: 'Aide élite' },
                { name: '/transcript', value: 'Transcript ticket\n- ticket_id' },
                { name: '/stats', value: 'Stats tickets' },
                { name: '/anti-raid', value: 'Vérifie état anti-raid' },
                { name: 'Anti-Raid', value: 'Activer: `!active-anti-raid`\nDésactiver: `!desactive-anti-raid`\n*Admin requis*' }
            )
            .setFooter({ text: 'Ticket V.I.P - Luxe Absolu' });

        await interaction.reply({ embeds: [helpEmbed], flags: [InteractionResponseFlags.Ephemeral] });
    }

    if (interaction.commandName === 'transcript') {
        const ticketId = interaction.options.getString('ticket_id');
        const transcript = ticketTranscripts.get(ticketId);

        if (!transcript) {
            return interaction.reply({ content: 'Transcript non trouvé!', flags: [InteractionResponseFlags.Ephemeral] });
        }

        const transcriptFile = new AttachmentBuilder(Buffer.from(transcript.join('\n')), { name: `transcript-${ticketId}.txt` });
        const transcriptEmbed = new EmbedBuilder()
            .setColor(GOLD_COLOR)
            .setTitle(`Transcript #${ticketId}`)
            .setDescription('Transcript joint ci-dessous.');

        await interaction.reply({ embeds: [transcriptEmbed], files: [transcriptFile], flags: [InteractionResponseFlags.Ephemeral] });
    }

    if (interaction.commandName === 'stats') {
        const statsEmbed = new EmbedBuilder()
            .setColor(GOLD_COLOR)
            .setTitle('Statistiques V.I.P Luxe Suprême')
            .addFields(
                { name: 'Tickets Créés', value: ticketConfig.ticketCounter.toString(), inline: true },
                { name: 'Tickets Actifs', value: activeTickets.size.toString(), inline: true },
                { name: 'Transcripts Sauvés', value: ticketTranscripts.size.toString(), inline: true }
            );

        await interaction.reply({ embeds: [statsEmbed], flags: [InteractionResponseFlags.Ephemeral] });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_ticket_category') {
        if (!ticketConfig.channelId) {
            return interaction.reply({ content: 'Système non configuré!', flags: [InteractionResponseFlags.Ephemeral] });
        }

        const userId = interaction.user.id;
        if (activeTickets.has(userId)) {
            return interaction.reply({ content: 'Vous avez déjà un ticket actif!', flags: [InteractionResponseFlags.Ephemeral] });
        }

        const categoryId = interaction.values[0];
        ticketConfig.ticketCounter++;
        const ticketId = ticketConfig.ticketCounter.toString().padStart(4, '0');

        const ticketChannel = await interaction.guild.channels.create({
            name: `vip-${categoryId}-${ticketId}`,
            type: ChannelType.GuildText,
            parent: ticketConfig.categoryId,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: ticketConfig.staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ManageChannels] }
            ]
        });

        activeTickets.set(userId, { channelId: ticketChannel.id, ticketId, category: categoryId, priority: 'Medium', createdAt: Date.now() });

        const priorityMenu = new StringSelectMenuBuilder()
            .setCustomId('set_priority')
            .setPlaceholder('Priorité')
            .addOptions(ticketConfig.priorityLevels.map(level => ({ label: level, value: level })));

        const ticketEmbed = new EmbedBuilder()
            .setColor(GOLD_COLOR)
            .setTitle(`Ticket V.I.P Luxe #${ticketId}`)
            .setDescription(ticketConfig.welcomeMessage)
            .addFields(
                { name: 'Utilisateur', value: `<@${userId}>`, inline: true },
                { name: 'Catégorie', value: ticketConfig.ticketCategories[categoryId].name, inline: true },
                { name: 'Priorité', value: 'Medium', inline: true },
                { name: 'Ticket ID', value: ticketId }
            )
            .setTimestamp();

        const closeButton = new ButtonBuilder().setCustomId('close_vip_ticket').setLabel('Fermer').setStyle(ButtonStyle.Danger).setEmoji('🔒');
        const lockButton = new ButtonBuilder().setCustomId('lock_vip_ticket').setLabel('Verrouiller').setStyle(ButtonStyle.Secondary).setEmoji('🔐');
        const transcriptButton = new ButtonBuilder().setCustomId('save_transcript').setLabel('Transcript').setStyle(ButtonStyle.Success).setEmoji('💾');
        const claimButton = new ButtonBuilder().setCustomId('claim_ticket').setLabel('Réclamer').setStyle(ButtonStyle.Primary).setEmoji('👑');

        const row1 = new ActionRowBuilder().addComponents(closeButton, lockButton, transcriptButton, claimButton);
        const row2 = new ActionRowBuilder().addComponents(priorityMenu);

        await ticketChannel.send({
            content: `<@&${ticketConfig.staffRoleId}> - Ticket V.I.P Luxe Suprême!`,
            embeds: [ticketEmbed],
            components: [row1, row2]
        });

        await interaction.reply({ content: `Ticket créé! Voir <#${ticketChannel.id}>`, flags: [InteractionResponseFlags.Ephemeral] });
        await logAction(interaction.guild, 'Ticket Créé', `Ticket #${ticketId} (${categoryId}) par ${interaction.user.tag}`);
    }

    if (interaction.isButton() || (interaction.isStringSelectMenu() && interaction.customId === 'set_priority')) {
        const ticketData = [...activeTickets.values()].find(t => t.channelId === interaction.channel.id);
        if (!ticketData) return;

        if (interaction.customId === 'close_vip_ticket') {
            const messages = await interaction.channel.messages.fetch();
            const transcript = messages.map(m => `[${new Date(m.createdTimestamp).toLocaleString()}] ${m.author.tag}: ${m.content}`).reverse();
            ticketTranscripts.set(ticketData.ticketId, transcript);

            const transcriptFile = new AttachmentBuilder(Buffer.from(transcript.join('\n')), { name: `transcript-${ticketData.ticketId}.txt` });
            await logAction(interaction.guild, 'Ticket Fermé', `Ticket #${ticketData.ticketId} fermé par ${interaction.user.tag}`, [transcriptFile]);

            const closeEmbed = new EmbedBuilder()
                .setColor(GOLD_COLOR)
                .setTitle(`Ticket #${ticketData.ticketId} Fermé`)
                .setDescription('Suppression dans 5 secondes...');

            await interaction.reply({ embeds: [closeEmbed] });

            setTimeout(async () => {
                const userId = [...activeTickets.entries()].find(([_, t]) => t.ticketId === ticketData.ticketId)[0];
                activeTickets.delete(userId);
                await interaction.channel.delete();
            }, 5000);
        }

        if (interaction.customId === 'lock_vip_ticket') {
            const userId = [...activeTickets.entries()].find(([_, t]) => t.ticketId === ticketData.ticketId)[0];
            await interaction.channel.permissionOverwrites.edit(userId, { SendMessages: false });

            const lockEmbed = new EmbedBuilder()
                .setColor(GOLD_COLOR)
                .setTitle(`Ticket #${ticketData.ticketId} Verrouillé`)
                .setDescription('Utilisateur bloqué.');

            await interaction.reply({ embeds: [lockEmbed] });
            await logAction(interaction.guild, 'Ticket Verrouillé', `Ticket #${ticketData.ticketId} par ${interaction.user.tag}`);
        }

        if (interaction.customId === 'save_transcript') {
            const messages = await interaction.channel.messages.fetch();
            const transcript = messages.map(m => `[${new Date(m.createdTimestamp).toLocaleString()}] ${m.author.tag}: ${m.content}`).reverse();
            ticketTranscripts.set(ticketData.ticketId, transcript);

            const saveEmbed = new EmbedBuilder()
                .setColor(GOLD_COLOR)
                .setTitle(`Transcript #${ticketData.ticketId} Sauvé`)
                .setDescription('Utilisez /transcript.');

            await interaction.reply({ embeds: [saveEmbed], flags: [InteractionResponseFlags.Ephemeral] });
            await logAction(interaction.guild, 'Transcript Sauvé', `Ticket #${ticketData.ticketId} par ${interaction.user.tag}`);
        }

        if (interaction.customId === 'claim_ticket') {
            await interaction.channel.permissionOverwrites.edit(ticketConfig.staffRoleId, { SendMessages: false });
            await interaction.channel.permissionOverwrites.edit(interaction.user.id, { SendMessages: true });

            const claimEmbed = new EmbedBuilder()
                .setColor(GOLD_COLOR)
                .setTitle(`Ticket #${ticketData.ticketId} Réclamé`)
                .setDescription(`Réclamé par <@${interaction.user.id}>`);

            await interaction.reply({ embeds: [claimEmbed] });
            await logAction(interaction.guild, 'Ticket Réclamé', `Ticket #${ticketData.ticketId} par ${interaction.user.tag}`);
        }

        if (interaction.customId === 'set_priority') {
            const newPriority = interaction.values[0];
            const userId = [...activeTickets.entries()].find(([_, t]) => t.ticketId === ticketData.ticketId)[0];
            activeTickets.set(userId, { ...ticketData, priority: newPriority });

            const priorityEmbed = new EmbedBuilder()
                .setColor(GOLD_COLOR)
                .setTitle(`Ticket #${ticketData.ticketId} - Priorité`)
                .setDescription(`Priorité mise à ${newPriority}`);

            await interaction.update({ embeds: [priorityEmbed], components: [] });
            await logAction(interaction.guild, 'Priorité Modifiée', `Ticket #${ticketData.ticketId} à ${newPriority} par ${interaction.user.tag}`);
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'vip_panel_select') {
        if (interaction.values[0] === 'vip_ticket_panel') {
            if (!ticketConfig.channelId) {
                return interaction.update({ content: 'Système non configuré!', components: [] });
            }

            const ticketEmbed = new EmbedBuilder()
                .setColor(GOLD_COLOR)
                .setTitle('✨ Ticket V.I.P Luxe Suprême')
                .setDescription(`Panel dans <#${ticketConfig.channelId}>`);

            await interaction.update({ embeds: [ticketEmbed], components: [] });
        }

        if (interaction.values[0] === 'vip_bot_ad') {
            const adEmbed = new EmbedBuilder()
                .setColor(GOLD_COLOR)
                .setTitle('Ticket V.I.P Luxe Suprême')
                .setDescription('Le meilleur système de tickets!\n- Catégories\n- Priorités\n- Transcripts\n- Réclamations\n- Logs\n- Stats')
                .setFooter({ text: 'Ticket V.I.P - Luxe Absolu par annaeg_2009' });

            await interaction.update({ embeds: [adEmbed], components: [] });
        }
    }
});

client.login(token);
