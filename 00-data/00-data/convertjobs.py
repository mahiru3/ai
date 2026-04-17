"""
旧jobs.jsonを新形式に変換するスクリプト。
旧形式: {name, edition, skills: {skill_name_ja: "True"|"1"|"2"|...}}
新形式: {id, name, edition, source, description, skill_points_formula, fixed_skills, choice_groups}
"""

import json
import sys
from collections import defaultdict

# --- 技能名(日本語) → 技能ID(英語) の変換表 ---
SKILL_MAP = {
    # 戦闘
    "回避": "dodge",
    "マーシャルアーツ": "martial_arts",
    "こぶし": "fist",
    "こぶし（パンチ）": "fist",
    "パンチ": "fist",
    "キック": "kick",
    "組み付き": "grapple",
    "組みつき": "grapple",
    "頭突き": "head_butt",
    "日本刀": "japanese_sword",
    "ナイフ": "knife",
    "杖": "staff",
    "薙刀": "naginata",
    "弓": "bow",
    "競技用アーチェリー": "archery",
    "チェーンソー": "chainsaw",
    "投擲": "throwing",
    "拳銃": "handgun",
    "ライフル": "rifle",
    "ショットガン": "shotgun",
    "サブマシンガン": "submachine_gun",
    "マシンガン": "machine_gun",
    "砲": "artillery",
    "グレネード・ランチャー": "grenade_launcher",
    "スタンガン": "stun_gun",
    # 探索・行動
    "目星": "spot_hidden",
    "聞き耳": "listen",
    "図書館": "library_use",
    "追跡": "track",
    "写真術": "photography",
    "ナビゲート": "navigate",
    "隠す": "conceal",
    "隠れる": "hide",
    "忍び歩き": "sneak",
    "鍵開け": "lock_pick",
    "変装": "disguise",
    "応急手当": "first_aid",
    "登攀": "climb",
    "跳躍": "jump",
    "水泳": "swim",
    "乗馬": "ride",
    "パラシュート": "parachute",
    "機械修理": "mech_repair",
    "電気修理": "elec_repair",
    "重機械操作": "heavy_machine",
    # 交渉
    "言いくるめ": "fast_talk",
    "信用": "credit_rating",
    "説得": "persuade",
    "値切り": "bargain",
    "心理学": "psychology",
    "精神分析": "psychoanalysis",
    # 言語
    "母国語": "native_language",
    "英語": "english",
    "ラテン語": "latin",
    "ドイツ語": "german",
    "中国語": "chinese",
    "朝鮮語": "korean",
    "ロシア語": "russian",
    "漢文": "classical_chinese",
    "その他言語": "other_language",  # 「ほかの言語」扱い
    "ほかの言語": "other_language",
    # 人文
    "歴史": "history",
    "考古学": "archaeology",
    "人類学": "anthropology",
    "法律": "law",
    "オカルト": "occult",
    "経理": "accounting",
    # 自然科学
    "医学": "medicine",
    "薬学": "pharmacy",
    "化学": "chemistry",
    "生物学": "biology",
    "物理学": "physics",
    "地質学": "geology",
    "天文学": "astronomy",
    "電子工学": "electronics",
    "博物学": "natural_history",
    "コンピューター": "computer_use",
    # 神話
    "クトゥルフ神話": "cthulhu_mythos",
    # メタ
    "個人の関心": "personal_interest",
    "個人の専門技能": "personal_specialty",
    "個人的な専門技能": "personal_specialty",
    "個人的な専門の技能": "personal_specialty",
    "個人的な関心のある技能": "personal_interest",
    "商品知識から好きな技能": "personal_specialty",
    "アイデア": "idea_skill",  # セールスマン用の謎技能、後で処理
}

# 専門分野マップ: 日本語フル名 → parent:specialty
SPECIALTY_SKILL_MAP = {
    # 武道
    "武道_柔道": "martial_arts:judo",
    "武道_任意": "martial_arts:any",
    # 製作
    "製作_料理": "craft:cooking",
    "製作_裁縫": "craft:sewing",
    "製作_掃除": "craft:cleaning",
    "製作_作曲": "craft:composing",
    "製作_作詞": "craft:lyrics",
    "製作_大工": "craft:carpentry",
    "製作_溶接": "craft:welding",
    "製作_配管": "craft:plumbing",
    "製作_農作物": "craft:agriculture",
    "製作_畜産": "craft:livestock",
    "製作_養蜂": "craft:beekeeping",
    "製作_古書修復": "craft:book_restoration",
    "製作_古美術修復": "craft:antique_restoration",
    "製作_ワイン鑑定": "craft:wine_tasting",
    "製作_コンピューター・ウイルス": "craft:computer_virus",
    "製作_任意": "craft:any",
    "制作_任意": "craft:any",  # 誤字吸収
    "制作_料理": "craft:cooking",
    # 運転
    "運転_自動車": "drive:car",
    "運転_二輪車": "drive:motorcycle",
    # 操縦
    "操縦_船舶": "pilot:ship",
    "操縦_ボート": "pilot:boat",
    "操縦_潜水艦": "pilot:submarine",
    "操縦_ヘリコプター": "pilot:helicopter",
    "操縦_民間プロペラ機": "pilot:civilian_prop",
    "操縦_民間ジェット機": "pilot:civilian_jet",
    "操縦_定期旅客機": "pilot:airliner",
    "操縦_ジェット戦闘機": "pilot:fighter_jet",
    "操縦_戦闘機": "pilot:fighter",
    "操縦_戦車": "pilot:tank",
    "操縦_航空機": "pilot:aircraft",
    "操縦_飛行機": "pilot:airplane",
    "操縦_大型機": "pilot:large_aircraft",
    # 芸術
    "芸術_歌唱": "art:singing",
    "芸術_演劇": "art:drama",
    "芸術_演技": "art:acting",
    "芸術_絵画": "art:painting",
    "芸術_ダンス": "art:dance",
    "芸術_文学": "art:literature",
    "芸術_音楽": "art:music",
    "芸術_音楽演奏": "art:music_play",
    "芸術_楽器演奏": "art:instrument",
    "芸術_美術": "art:fine_art",
    "芸術_司会": "art:mc",
    "芸術_アナウンス": "art:announce",
    "芸術_ファッション": "art:fashion",
    "芸術_物語": "art:storytelling",
    "芸術_ギャンブル": "art:gambling",
    "芸術_詩的表現": "art:poetry",
    "芸術_トリビア知識": "art:trivia",
    "芸術_イカサマ": "art:cheating",
    "芸術_刺青彫": "art:tattoo",
    "芸術_アロマ": "art:aroma",
    "芸術_ゲーム": "art:game",
    "芸術_ハッキング": "art:hacking",
    "芸術_握手": "art:handshake",
    "芸術_任意のスポーツ競技": "art:sports_any",
    "芸術_何かのスポーツ": "art:sports_some",
    "芸術_何かの音楽演奏": "art:music_some",
    "芸術_任意": "art:any",
    "芸術_HO2": "art:any",  # 扱い不明、任意扱い
    # サバイバル
    "サバイバル_海": "survival:sea",
    "サバイバル_山": "survival:mountain",
    "サバイバル_砂漠": "survival:desert",
    # 自由選択系（ファジー）
    "任意の近接戦闘": "ANY_MELEE",
    "任意の近接戦技能": "ANY_MELEE",
    "任意の素手近接戦": "ANY_UNARMED",
    "任意の素手の戦闘": "ANY_UNARMED",
    "任意の素手の近接戦技能": "ANY_UNARMED",
    "任意の火器": "ANY_FIREARM",
    "任意の火器技能": "ANY_FIREARM",
}

# 自由選択（特殊マーカー）の展開テーブル
ANY_SKILL_GROUPS = {
    "ANY_MELEE": {
        "label": "任意の近接戦闘技能から",
        "candidates": [
            "fist", "kick", "grapple", "head_butt",
            "japanese_sword", "knife", "staff", "naginata",
            "bow", "archery", "chainsaw", "throwing",
            "martial_arts:any"
        ]
    },
    "ANY_UNARMED": {
        "label": "任意の素手近接戦技能から",
        "candidates": [
            "fist", "kick", "grapple", "head_butt", "martial_arts:any"
        ]
    },
    "ANY_FIREARM": {
        "label": "任意の火器技能から",
        "candidates": [
            "handgun", "rifle", "shotgun", "submachine_gun",
            "machine_gun", "artillery", "grenade_launcher", "stun_gun", "bow", "archery"
        ]
    }
}


def normalize_value(v):
    """値を正規化: 全角プライム/数字を半角に、選択群キーに"""
    if v is True:
        return "fixed"
    s = str(v).strip()
    # 全角数字→半角
    trans = str.maketrans("０１２３４５６７８９", "0123456789")
    s = s.translate(trans)
    # 全角プライム→半角
    s = s.replace("'", "'")
    if s == "True":
        return "fixed"
    return s  # "1", "2", "3", "4", "1'" など


def convert_skill_key(skill_name):
    """旧技能名 → 新ID(またはANYマーカー)。Noneなら未対応。"""
    s = skill_name.strip()
    if s in SPECIALTY_SKILL_MAP:
        return SPECIALTY_SKILL_MAP[s]
    if s in SKILL_MAP:
        return SKILL_MAP[s]
    return None


def convert_job(old):
    """1職業分を新形式に変換"""
    name = old["name"]
    edition = str(old.get("edition", "")).strip()

    # sourceの正規化
    if edition == "基本":
        source = "基本"
    elif edition == "2010":
        source = "2010"
    elif edition == "2015":
        source = "2015"
    elif edition == "？？？？？":
        # 個別判断:
        if name == "自衛官":
            source = "2010"  # Wiki記載あり・基本外
        else:
            source = "unknown"
    else:
        source = edition if edition else "unknown"

    fixed_skills = []
    # 選択群: {group_key: {"count": N, "items": [...]}}
    groups = defaultdict(list)

    warnings = []

    for skill_name, raw_val in old["skills"].items():
        new_id = convert_skill_key(skill_name)
        if new_id is None:
            warnings.append(f"未対応技能: {name} / {skill_name}")
            continue
        val = normalize_value(raw_val)
        if val == "fixed":
            fixed_skills.append(new_id)
        else:
            # "1", "2", "3", "4", "1'" など
            groups[val].append(new_id)

    # choice_groupsを組み立てる
    choice_groups = []
    for key, items in groups.items():
        # select_count: 数字部分
        num_part = ''.join(c for c in key if c.isdigit())
        try:
            select_count = int(num_part) if num_part else 1
        except ValueError:
            select_count = 1

        is_prime = "'" in key
        label_suffix = " (別群)" if is_prime else ""
        label = f"次の技能から{select_count}つ選択{label_suffix}"

        # ANY_* マーカーの展開
        expanded_candidates = []
        has_any_marker = False
        for it in items:
            if it in ANY_SKILL_GROUPS:
                has_any_marker = True
                # ANYマーカーは別のchoice_groupに切り出す
                choice_groups.append({
                    "label": ANY_SKILL_GROUPS[it]["label"] + f"{select_count}つ選択",
                    "select_count": select_count,
                    "candidates": ANY_SKILL_GROUPS[it]["candidates"]
                })
            else:
                expanded_candidates.append(it)
        if expanded_candidates:
            choice_groups.append({
                "label": label,
                "select_count": select_count,
                "candidates": expanded_candidates
            })

    # fixed_skills内のANYマーカーも処理
    new_fixed = []
    for fs in fixed_skills:
        if fs in ANY_SKILL_GROUPS:
            # 固定でANYマーカー=「1つ選択」扱い
            choice_groups.append({
                "label": ANY_SKILL_GROUPS[fs]["label"] + "1つ選択",
                "select_count": 1,
                "candidates": ANY_SKILL_GROUPS[fs]["candidates"]
            })
        else:
            new_fixed.append(fs)
    fixed_skills = new_fixed

    # 重複排除(fixedに同じIDが2回入ることはないはずだが保険)
    fixed_skills = list(dict.fromkeys(fixed_skills))

    return {
        "name": name,
        "source": source,
        "fixed_skills": fixed_skills,
        "choice_groups": choice_groups,
        "_warnings": warnings,
        "_original_edition": edition
    }, warnings


# --- IDジェネレーター ---
def make_id(name, source, counter):
    """職業のユニークID生成。重複時はsourceを付けて区別。"""
    # 日本語名のローマ字化は複雑なので簡易辞書で対応
    NAME_MAP = {
        "医師": "doctor",
        "外科医": "surgeon",
        "歯科医": "dentist",
        "アニマルセラピスト": "animal_therapist",
        "看護師": "nurse",
        "救急救命士": "paramedic",
        "形成外科医": "plastic_surgeon",
        "精神科医": "psychiatrist",
        "闇医者": "black_market_doctor",
        "海上保安官": "coast_guard",
        "科学捜査研究員": "forensic_researcher",
        "山岳救助隊員": "mountain_rescue",
        "消防士": "firefighter",
        "芸術家": "artist",
        "ダンサー": "dancer",
        "デザイナー": "designer",
        "ファッション系芸術家": "fashion_artist",
        "自衛官": "sdf_member",
        "陸上自衛隊員": "gsdf",
        "海上自衛隊員": "msdf",
        "自衛隊パイロット": "sdf_pilot",
        "民間軍事会社メンバー": "pmc_member",
        "DEX系アスリート": "dex_athlete",
        "スポーツ選手": "athlete",
        "冒険家教授": "adventurer_professor",
        "評論家": "critic",
        "アイドル": "idol",
        "アナウンサー": "announcer",
        "コメディアン": "comedian",
        "スポーツタレント": "sports_talent",
        "テレビ・コメンテーター": "tv_commentator",
        "ネットタレント": "net_talent",
        "俳優": "actor",
        "プロデューサー/マネージャー": "producer_manager",
        "ゴーストハンター": "ghost_hunter",
        "占い師": "fortune_teller",
        "執事/メイド": "butler_maid",
        "セールスマン": "salesperson",
        "ホスト": "host",
        "メカニック": "mechanic",
        "料理人": "chef",
        "ギャンブラー": "gambler",
        "経済犯罪者": "white_collar_criminal",
        "ストリート・ローグ": "street_rogue",
        "ネット犯罪者": "cybercriminal",
        "用心棒": "bodyguard",
        "狂信者": "zealot",
        "公選職": "elected_official",
        "自宅警備員": "home_guard",
        "人間山脈": "human_mountain",
        "ビデオ・ゲーム・テスター": "game_tester",
        "ビデオ・ジャーナリスト": "video_journalist",
        "エンジニア": "engineer",
        "刑事": "detective",
        "警官": "police",
        "古物研究家": "antiquarian",
        "コンピューター技術者": "computer_tech",
        "作家": "writer",
        "ジャーナリスト": "journalist",
        "宗教家": "religious",
        "商店主": "shopkeeper",
        "私立探偵": "private_investigator",
        "水産業従事者": "fishery_worker",
        "大学教授": "professor",
        "タレント": "talent",
        "超心理学者": "parapsychologist",
        "ディレッタント": "dilettante",
        "ドライバー": "driver",
        "ボートレーサー": "boat_racer",
        "農林業従事者": "farmer",
        "パイロット": "pilot_job",
        "ビジネスマン": "businessman",
        "法律家": "lawyer",
        "暴力団組員": "yakuza",
        "放浪者": "drifter",
        "ミュージシャン": "musician",
        "メンタルセラピスト": "mental_therapist",
    }
    base = NAME_MAP.get(name, f"job_{counter}")
    # source suffix
    src_suffix = {"基本": "_basic", "2010": "_2010", "2015": "_2015"}.get(source, "")
    return base + src_suffix


def main():
    with open("/mnt/user-data/uploads/jobs.json", "r", encoding="utf-8") as f:
        old_jobs = json.load(f)

    print(f"元データ件数: {len(old_jobs)}")

    # 削除対象の判定
    new_jobs = []
    all_warnings = []
    id_used = set()

    # インデックスを管理して重複判定
    seen_name_source = {}

    for idx, old in enumerate(old_jobs):
        name = old["name"]
        edition = str(old.get("edition", "")).strip()
        # 削除対象: 医師(edition=2010)で技能4個だけの最初の1件
        if name == "医師" and edition == "2010" and len(old["skills"]) == 4:
            print(f"  → 削除: {name} (技能不足の不完全データ)")
            continue
        # 削除対象: 芸術家(edition=？？？？？)
        if name == "芸術家" and "？" in edition:
            print(f"  → 削除: {name} (edition不明)")
            continue

        converted, warns = convert_job(old)
        all_warnings.extend(warns)

        job_id = make_id(name, converted["source"], idx)
        # 重複時はインデックス付ける
        if job_id in id_used:
            job_id = f"{job_id}_{idx}"
        id_used.add(job_id)

        result = {
            "id": job_id,
            "name": converted["name"],
            "edition": "6",
            "source": converted["source"],
            "description": "",
            "skill_points_formula": "EDU*20",
            "fixed_skills": converted["fixed_skills"],
            "choice_groups": converted["choice_groups"]
        }
        new_jobs.append(result)

    print(f"\n変換後件数: {len(new_jobs)}")
    print(f"警告数: {len(all_warnings)}")
    if all_warnings:
        print("\n未対応技能の警告:")
        for w in all_warnings[:30]:
            print(f"  {w}")
        if len(all_warnings) > 30:
            print(f"  ... 他 {len(all_warnings) - 30}件")

    # 出力
    output = {
        "version": "1.0",
        "edition": "6",
        "comment": "第6版 職業マスタ。skill_points_formulaは原則EDU*20。choice_groupsで選択式職業技能を表現。",
        "jobs": new_jobs
    }
    with open("/home/claude/work/jobs_new.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print("\n出力: /home/claude/work/jobs_new.json")


if __name__ == "__main__":
    main()
