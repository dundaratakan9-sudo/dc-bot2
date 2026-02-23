const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
require("dotenv").config();

if (!process.env.TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
  console.error("HATA: .env içinde TOKEN / CLIENT_ID / GUILD_ID eksik.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// --------------------
// Slash komutları
// --------------------
const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Bot çalışıyor mu kontrol eder"),

  new SlashCommandBuilder()
    .setName("duyuru")
    .setDescription("Embed duyuru atar")
    .addStringOption((o) =>
      o.setName("baslik").setDescription("Duyuru başlığı").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("mesaj").setDescription("Duyuru mesajı").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("temizle")
    .setDescription("Bulunduğun kanalda mesaj siler (1-100)")
    .addIntegerOption((o) =>
      o
        .setName("adet")
        .setDescription("Kaç mesaj silinsin? (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("kilit")
    .setDescription("Bu kanalı herkes için yazmaya kapatır")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("ac")
    .setDescription("Bu kanalı tekrar yazılabilir yapar")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kullanıcıyı sunucudan atar")
    .addUserOption((o) =>
      o.setName("uye").setDescription("Atılacak üye").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("sebep").setDescription("Sebep (opsiyonel)").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Kullanıcıyı sunucudan banlar")
    .addUserOption((o) =>
      o.setName("uye").setDescription("Banlanacak üye").setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("mesaj_sil_gun")
        .setDescription("Kaç gün mesaj silinsin? (0-7)")
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(7)
    )
    .addStringOption((o) =>
      o.setName("sebep").setDescription("Sebep (opsiyonel)").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("ID ile ban kaldırır")
    .addStringOption((o) =>
      o
        .setName("kullanici_id")
        .setDescription("Banı kalkacak kullanıcı ID")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
].map((c) => c.toJSON());

// --------------------
// Komutları sunucuya yükle
// --------------------
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

async function registerCommands() {
  console.log("Komutlar yükleniyor...");
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log("Komutlar yüklendi!");
}

// --------------------
// Yardımcı: güvenli cevap
// --------------------
async function safeReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
    return interaction.reply(payload);
  } catch (e) {
    // sessiz geç
  }
}

client.once("ready", () => {
  console.log(`Bot aktif: ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const { commandName } = interaction;

    if (commandName === "ping") {
      return safeReply(interaction, { content: "Pong! 🏓 Bot çalışıyor.", ephemeral: true });
    }

    if (commandName === "duyuru") {
      const baslik = interaction.options.getString("baslik", true);
      const mesaj = interaction.options.getString("mesaj", true);

      const embed = new EmbedBuilder()
        .setTitle(baslik)
        .setDescription(mesaj)
        .setFooter({ text: `Duyuru: ${interaction.user.tag}` })
        .setTimestamp(Date.now());

      await interaction.channel.send({ embeds: [embed] });
      return safeReply(interaction, { content: "Duyuru gönderildi ✅", ephemeral: true });
    }

    if (commandName === "temizle") {
      const adet = interaction.options.getInteger("adet", true);

      // Bulk delete 14 günden eski mesajları silemez
      const deleted = await interaction.channel.bulkDelete(adet, true);
      return safeReply(interaction, {
        content: `✅ ${deleted.size} mesaj silindi. (14+ gün olanlar silinmez)`,
        ephemeral: true,
      });
    }

    if (commandName === "kilit") {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false,
      });
      return safeReply(interaction, { content: "🔒 Kanal kilitlendi.", ephemeral: true });
    }

    if (commandName === "ac") {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: null, // izinleri varsayılan hale getir
      });
      return safeReply(interaction, { content: "🔓 Kanal açıldı.", ephemeral: true });
    }

    if (commandName === "kick") {
      const user = interaction.options.getUser("uye", true);
      const reason = interaction.options.getString("sebep") ?? "Sebep belirtilmedi.";

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return safeReply(interaction, { content: "Bu kullanıcı sunucuda değil.", ephemeral: true });

      // Güvenlik: kendini / botu / owner'ı kicklemeyi engelle
      if (user.id === interaction.user.id) return safeReply(interaction, { content: "Kendini atamazsın 😄", ephemeral: true });
      if (user.id === client.user.id) return safeReply(interaction, { content: "Ben beni atamam 😄", ephemeral: true });
      if (user.id === interaction.guild.ownerId) return safeReply(interaction, { content: "Sunucu sahibini atamazsın.", ephemeral: true });

      await member.kick(reason);
      return safeReply(interaction, { content: `👢 ${user.tag} atıldı. Sebep: ${reason}`, ephemeral: false });
    }

    if (commandName === "ban") {
      const user = interaction.options.getUser("uye", true);
      const reason = interaction.options.getString("sebep") ?? "Sebep belirtilmedi.";
      const delDays = interaction.options.getInteger("mesaj_sil_gun") ?? 0;

      if (user.id === interaction.user.id) return safeReply(interaction, { content: "Kendini banlayamazsın 😄", ephemeral: true });
      if (user.id === client.user.id) return safeReply(interaction, { content: "Beni banlayamazsın 😄", ephemeral: true });
      if (user.id === interaction.guild.ownerId) return safeReply(interaction, { content: "Sunucu sahibini banlayamazsın.", ephemeral: true });

      await interaction.guild.members.ban(user.id, {
        reason,
        deleteMessageSeconds: delDays * 24 * 60 * 60, // 0-7 gün
      });

      return safeReply(interaction, {
        content: `⛔ ${user.tag} banlandı. Mesaj silme: ${delDays} gün. Sebep: ${reason}`,
        ephemeral: false,
      });
    }

    if (commandName === "unban") {
      const userId = interaction.options.getString("kullanici_id", true).trim();

      // Basit ID doğrulama
      if (!/^\d{15,21}$/.test(userId)) {
        return safeReply(interaction, { content: "Geçerli bir kullanıcı ID gir.", ephemeral: true });
      }

      await interaction.guild.members.unban(userId);
      return safeReply(interaction, { content: `✅ Ban kaldırıldı: ${userId}`, ephemeral: false });
    }
  } catch (e) {
    console.error(e);
    return safeReply(interaction, { content: `Hata oluştu: ${e?.message ?? e}`, ephemeral: true });
  }
});

// Başlat
(async () => {
  await registerCommands();
  await client.login(process.env.TOKEN);
})();