#!/usr/bin/env python3
"""Import the Casa 218 food-cost spreadsheet into data/food-cost.json.

The workbook is an Apple Numbers export: one price list and one sheet per
dish. Prices are copied as written. Nonsense prices, blank prices, and
unmatched catalogue lines are flagged. Nothing is given a made-up price.

Usage:
  python3 scripts/import-food-cost.py <workbook.xlsx> <out.json>
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from openpyxl import load_workbook

NONSENSE_PRICE = 1_000_000

SUPPLIERS = [
    ("chef-garden", "Chef Garden", "CHEF GARDEN"),
    ("los-ibericos", "Los Ibéricos", "LOS IBERICOS"),
    ("fiesta", "Fiesta", "FIESTA"),
    ("macfields", "Macfields", "MACFIELDS"),
    ("global-fine-foods", "Global Fine Foods", "GLOBAL FINE FOODS"),
    ("wah-cheong", "Wah Cheong Trading", "WAH CHEONG TRADING"),
    ("shu-kee", "Shu Kee Seafood", "SHU KEE SEAFOOD"),
    ("caves-asia", "Caves Asia", "CAVES ASIA"),
    ("olivier-pacific", "Olivier Pacific", "OLIVIER PACIFIC"),
    ("ongo-food", "Ongo Food", "ONGO FOOD"),
    ("regency", "Regency", "REGENCY"),
]
HEADER_TO_SUPPLIER = {header: sid for sid, _name, header in SUPPLIERS}

# Sheet tab (stripped) -> category. Party sheets are matched by prefix.
CATEGORY = {
    "Grilled Octopus Salad": "tapas",
    "ENSALDA de TOMATE": "tapas",
    "AVOCADO SALAD": "tapas",
    "balsamic dressing": "preparations",
    "GAZPACHO": "tapas",
    "PAN CON TOMATE": "tapas",
    "PATATAS BRAVAS": "tapas",
    "salsa brava": "preparations",
    "ACIETUNA ALIÑADAS": "tapas",
    "TORTILLA": "tapas",
    "GILDA": "tapas",
    "MANCHEGO CHEESE": "tapas",
    "BOQUERONES": "tapas",
    "CHICKEN PINCHOS": "tapas",
    "BEEF PINCHOS": "tapas",
    "Spanish dry rub": "preparations",
    "ALBONDIGAS": "tapas",
    "tomato sauce": "preparations",
    "GAMBAS (GARLIC PRAWNS)": "tapas",
    "garlic confit": "preparations",
    "PULPO GALLEGO": "tapas",
    "OCTOPUS SALAD": "tapas",
    "MUSSELS": "tapas",
    "CLAMS": "tapas",
    "onion confit": "preparations",
    "SPANISH CHORIZO": "tapas",
    "CROQUETAS - MUSHROOM": "tapas",
    "CROQUETAS - SHRIMPS": "tapas",
    "CROQUETAS - COD": "tapas",
    "CROQUETAS - JAMON": "tapas",
    "aoli - oli": "preparations",
    "JAMON IBERICO": "tapas",
    "STUFFED EGGPLANT": "mains",
    "BARRAMUNDI": "mains",
    "lemon caper sauce": "preparations",
    "FILETE CHULETÓN (HANGER STEAK)": "mains",
    "HANGER STEAK": "mains",
    "potato gratin": "preparations",
    "chimichurri sauce": "preparations",
    "PORK STEAK": "mains",
    "mash potato": "preparations",
    "CHORIZO PAELLA": "mains",
    "POLENTA": "preparations",
    "bomba rice": "preparations",
    "SEAFOOD PAELLA": "mains",
    "SEAFOOD FIDEUA": "mains",
    "CREMA CATALANA": "desserts",
    "FLAN": "desserts",
    "CHURROS": "desserts",
    "CHEESE CAKE": "desserts",
    "balsamic vinagratte": "preparations",
    "PIMIENTOS DE PADRON": "tapas",
    "STUFFED BELL PEPPER": "tapas",
    "CRISPY PORK BELLY": "mains",
    "OCTOPUS": "mains",
    "Copy of MASTER": "mains",
    "PIMIENTOS DE PADRON 2": "tapas",
    "herb mayonnaise": "preparations",
    "PINCHO- ANCHOVY": "tapas",
    "TABLA MIXTA": "tapas",
    "JAMON SERRANO PINCHO": "tapas",
    "PINCHO - CHORIZO": "tapas",
    "hot fries seasoning": "preparations",
    "PAELLA VALENCIANA": "mains",
    "BOCADILLO DE JAMON": "tapas",
    "BOCADILLO DE CERDO": "tapas",
    "BOCADILLO DE CALAMARY": "tapas",
    "chili pesto": "preparations",
    "sofrito sauce": "preparations",
    "BOCADILLO DE ALBÓNDIGAS": "tapas",
    "ARROZ AMARILLO": "mains",
    "Veg Springroll": "tapas",
    "GUISO DE COLIFLOR": "mains",
    "Pork Springroll": "tapas",
    "Hot Wings": "tapas",
    "blue cheese sause": "preparations",
    "buffalo sauce": "preparations",
    "MALAGA SALAD": "tapas",
    "ENSALADA MURCIANA": "tapas",
    "PORK CHOP": "mains",
    "BOCADILLO DE LOMO": "tapas",
    "BACALAO": "mains",
    "BOCADILLO DE CARNE": "tapas",
}

SKIP_SHEETS = {"Export Summary", "All Ingredients", "MASTER"}

# Recipe lines that are another sheet, not a bought product.
# (regex against the normalised line name, sheet tab to link).
COMPONENTS = [
    (re.compile(r"\baioli\b|\baoli\b"), "aoli - oli"),
    (re.compile(r"brava"), "salsa brava"),
    (re.compile(r"balsamic dressing"), "balsamic dressing"),
    (re.compile(r"vinaigrette|vinagratte"), "balsamic vinagratte"),
    (re.compile(r"tomato sauce"), "tomato sauce"),
    (re.compile(r"garlic confit"), "garlic confit"),
    (re.compile(r"onion confit"), "onion confit"),
    (re.compile(r"dry rub"), "Spanish dry rub"),
    (re.compile(r"chimichurri|mojo verde"), "chimichurri sauce"),
    (re.compile(r"lemon caper"), "lemon caper sauce"),
    (re.compile(r"potato gratin"), "potato gratin"),
    (re.compile(r"mashed"), "mash potato"),
    (re.compile(r"patatas bravas"), "PATATAS BRAVAS"),
    (re.compile(r"pan de tomato|pan con tomate"), "PAN CON TOMATE"),
    (re.compile(r"chil[i]? pesto"), "chili pesto"),
    (re.compile(r"herb mayonnaise|herb mayo"), "herb mayonnaise"),
    (re.compile(r"sofrito"), "sofrito sauce"),
    (re.compile(r"buffalo"), "buffalo sauce"),
    (re.compile(r"blue cheese"), "blue cheese sause"),
    (re.compile(r"hot fries"), "hot fries seasoning"),
    (re.compile(r"\bpolenta\b"), "POLENTA"),
    (re.compile(r"bomba rice|rice cooked|cooked rice"), "bomba rice"),
]

UNIT_SYNONYM = {
    "g": "g",
    "gr": "g",
    "gram": "g",
    "grams": "g",
    "kg": "kg",
    "kgs": "kg",
    "ml": "ml",
    "l": "l",
    "lt": "l",
    "ltr": "l",
    "litre": "l",
    "liter": "l",
    "oz": "oz",
    "lb": "lb",
    "lbs": "lb",
    "tbsp": "tbsp",
    "tbs": "tbsp",
    "tbps": "tbsp",
    "tabp": "tbsp",
    "tablespoon": "tbsp",
    "tsp": "tsp",
    "tips": "tsp",
    "teaspoon": "tsp",
    "c": "cup",
    "cup": "cup",
    "cups": "cup",
    "pinch": "pinch",
    "pc": "piece",
    "pcs": "piece",
    "ea": "piece",
    "ec": "piece",
    "piece": "piece",
    "each": "piece",
    "bun": "bunch",
    "bunch": "bunch",
}

CJK = re.compile(r"[\u4e00-\u9fff]+")
NON_FOOD_WORDS = (
    "toothpick",
    "cup lid",
    "drinking cup",
    "cutlery",
    "garbage bag",
    "doyley",
)


def num(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        # A typed fraction such as 1/3 was stored as a date (format d/m).
        if value.month:
            return round(value.day / value.month, 6)
        return None
    if isinstance(value, str):
        text = value.strip().replace(",", "")
        if text in {"", "#DIV/0!", "-"}:
            return None
        try:
            value = float(text)
        except ValueError:
            return None
    value = float(value)
    rounded = round(value, 6)
    if abs(rounded - round(rounded)) < 1e-9:
        return int(round(rounded))
    return rounded


def text(value):
    if value is None:
        return ""
    return str(value).replace("\n", " ").strip()


def slugify(value):
    value = value.lower()
    value = value.replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u").replace("ñ", "n")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:70] or "item"


def norm(value):
    value = value.lower().replace("’", "'")
    value = re.sub(r"\([^)]*\)", " ", value)
    value = value.replace(",", " ")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    # Cooking verbs only. Words like peeled, dried, and whole change which product it is.
    value = re.sub(
        r"\b(finely|thinly|roughly|freshly|chopped|minced|diced|sliced|grated|boiled|to taste)\b",
        " ",
        value,
    )
    value = re.sub(r"\s+", " ", value).strip()
    return value


def clean_zh(value):
    if not value:
        return None
    value = re.sub(r"(公斤|公升|個|隻|包|扎|紮|條|盒)+$", "", value)
    return value or None


def split_names(raw):
    chinese = "".join(CJK.findall(raw))
    english = CJK.sub(" ", raw)
    english = re.sub(r"\s+", " ", english).strip(" -/")
    return english or raw.strip(), chinese or None


def is_non_food(name):
    lowered = name.lower()
    return any(word in lowered for word in NON_FOOD_WORDS)


def confirmed_flag(value):
    if not value:
        return None
    token = value.strip().lower().replace("'", "")
    if token in {"name", "ok"}:
        return None
    if "dont know" in token or "don't know" in token or "which one" in token or token in {"?", "？"}:
        return "unmatched"
    if token.strip(" ?") == "":
        return "unmatched"
    return None


def category_for(sheet):
    key = sheet.strip()
    if key.upper().startswith("PARTY"):
        return "party"
    if key not in CATEGORY:
        raise SystemExit(f"No category for sheet {sheet!r}")
    return CATEGORY[key]


def display_name(value):
    value = re.sub(r"\s+", " ", value).strip()

    def piece(token):
        letters = re.sub(r"[^A-Za-zÁÉÍÓÚÑáéíóúñ]", "", token)
        if len(letters) >= 2 and letters.upper() == letters:
            lower = token.lower()
            if lower in {"de", "del", "al", "con", "y", "en", "a"}:
                return lower
            return token.capitalize()
        return token

    return "".join(piece(part) if part.strip() else part for part in re.split(r"(\s+|-)", value))


def canonical_unit(raw):
    token = raw.strip().lower().rstrip(".")
    return UNIT_SYNONYM.get(token)


def supplier_id_from_recipe(raw):
    if not raw:
        return None
    token = re.sub(r"[^a-z]", "", raw.lower())
    aliases = {
        "chefgarden": "chef-garden",
        "chefgardens": "chef-garden",
        "chefsgarden": "chef-garden",
        "ongo": "ongo-food",
        "ongofood": "ongo-food",
        "wahcheung": "wah-cheong",
        "wahcheong": "wah-cheong",
        "wahcheongtrading": "wah-cheong",
        "losibericos": "los-ibericos",
        "losiberico": "los-ibericos",
        "losibericoa": "los-ibericos",
        "losibericosa": "los-ibericos",
        "olivier": "olivier-pacific",
        "olivierpacific": "olivier-pacific",
        "shukee": "shu-kee",
        "shukeeseafood": "shu-kee",
        "regency": "regency",
        "fiesta": "fiesta",
        "macfields": "macfields",
        "globalfinefoods": "global-fine-foods",
        "cavesasia": "caves-asia",
        "inhouse": None,
    }
    return aliases.get(token)


def in_house(raw):
    return supplier_id_from_recipe(raw) is None and "house" in raw.lower()


def component_sheet(name_norm, current_sheet):
    for pattern, sheet in COMPONENTS:
        if pattern.search(name_norm):
            if sheet.strip() == current_sheet.strip():
                return None
            return sheet
    return None


def recipe_slug(name_norm, unit, sheet):
    """Kitchen ingredient for a recipe line. None means a component or water handled elsewhere."""
    n = name_norm
    sheet_l = sheet.lower()

    if n in {"water"}:
        return "water"
    if "yolk" in n:
        return "egg-yolk"
    if re.search(r"\begg", n) and "eggplant" not in n and "plant" not in n:
        return "egg"
    if "garlic powder" in n:
        return "garlic-powder"
    if "garlic" in n and "confit" not in n:
        return "garlic"
    if "onion powder" in n:
        return "onion-powder"
    if "spring onion" in n:
        return "spring-onion"
    if "red onion" in n:
        return "red-onion"
    if "shallot" in n:
        return "shallot"
    if "onion" in n:
        return "onion"
    if "cherry" in n and "tomato" in n:
        return "cherry-tomato"
    if "paste" in n and "tomato" in n:
        return "tomato-paste"
    if "tomato" in n and ("peeled" in n or "canned" in n):
        return "peeled-tomato"
    if "tomato" in n and "sauce" not in n:
        return "tomato"
    if "potato" in n:
        return "potato"
    if "cucumber" in n:
        return "cucumber"
    if "avocado" in n:
        return "avocado"
    if "padron" in sheet_l and "pepper" in n:
        return "padron"
    if "piquillo" in n or "pimiento" in n:
        return "piquillo"
    if "flake" in n and ("pepper" in n or "chili" in n or "chilli" in n):
        return "chilli-flakes"
    if "thai" in n and ("chili" in n or "chilli" in n):
        return "thai-chilli"
    if "jalapeno" in n or "jalapeño" in n:
        return "jalapeno"
    if "long chili" in n or "long chilli" in n or n in {"red chili", "red chilli"}:
        return "red-chilli"
    if "bell" in n or (("pepper" in n or "peppers" in n) and any(w in n for w in ("diced", "canned", "green", "red", "yellow")) and "black" not in n and "flake" not in n):
        if "yellow" in n:
            return "bell-pepper-yellow"
        if "green" in n and "red" not in n:
            return "bell-pepper-green"
        if "red" in n and "green" not in n:
            return "bell-pepper-red"
        return "bell-pepper"
    if "black olive" in n or n == "black olives":
        return "black-olive"
    if "green olive" in n or "pitted green" in n or n == "green olives":
        return "green-olive"
    if "olive" in n and "oil" not in n:
        return "olive-mix"
    if "extra virgin" in n or n in {"olive oil", "olive"} or "olive oil" in n:
        return "olive-oil"
    if "vegetable oil" in n or "cooking oil" in n:
        return "vegetable-oil"
    if "sherry" in n and "vinegar" in n:
        return "sherry-vinegar"
    if "balsamic" in n and "glaze" not in n:
        return "balsamic-vinegar"
    if "white wine vinegar" in n:
        return "white-wine-vinegar"
    if "red wine vinegar" in n or n == "white vinegar":
        return "white-vinegar" if n == "white vinegar" else "red-wine-vinegar"
    if "vinegar" in n:
        return "vinegar"
    if "white wine" in n or n == "wine":
        return "white-wine"
    if "red wine" in n:
        return "red-wine"
    if "brandy" in n:
        return "brandy"
    if "bomba" in n or "short grain" in n:
        return "bomba-rice"
    if n == "rice" or "thai rice" in n:
        return "thai-rice"
    if "smoked" in n and "paprika" in n:
        return "paprika-smoked"
    if "hot" in n and "paprika" in n:
        return "paprika-hot"
    if "paprika" in n:
        return "paprika"
    if "saffron" in n:
        return "saffron"
    if "salt cod" in n or "bacalao" in n:
        return "salt-cod"
    if re.search(r"\bcod\b", n):
        return "cod"
    if "kosher" in n or n == "salt" or n.startswith("salt ") or "sea salt" in n:
        return "salt"
    if "white pepper" in n:
        return "white-pepper"
    if "pepper" in n or "peppercorn" in n:
        return "black-pepper"
    if "parsley" in n and unit == "bunch":
        return "parsley-fresh"
    if "parsley" in n and "dried" in n:
        return "parsley-dried"
    if "parsley" in n:
        return "parsley-fresh"
    if "rosemary" in n and unit == "bunch":
        return "rosemary-fresh"
    if "rosemary" in n:
        return "rosemary-dried"
    if "thyme" in n and "dried" in n:
        return "thyme-dried"
    if "thyme" in n:
        return "thyme-fresh"
    if "oregano" in n and unit == "bunch":
        return "oregano-fresh"
    if "oregano" in n:
        return "oregano-dried"
    if "cumin" in n:
        return "cumin"
    if "coriander" in n and "powder" in n:
        return "coriander-ground"
    if "coriander" in n:
        return "coriander-fresh"
    if "bay" in n:
        return "bay-leaf"
    if "cinnamon" in n:
        return "cinnamon"
    if "chilli" in n or "chili" in n:
        return "red-chilli"
    if "breadcrumb" in n or "bread crumb" in n:
        return "breadcrumbs"
    if "baguette" in n:
        return "baguette"
    if n == "bread" or n.startswith("bread "):
        return "bread"
    if "flour" in n:
        return "flour"
    if "icing" in n or "brown sugar" in n:
        return "icing-sugar" if "icing" in n else "brown-sugar"
    if "sugar" in n:
        return "sugar"
    if "honey" in n:
        return "honey"
    if "mustard" in n or "mustartd" in n:
        return "mustard"
    if "caper" in n:
        return "capers"
    if "cream cheese" in n:
        return "cream-cheese"
    if "condense" in n or "condensed" in n:
        return "condensed-milk"
    if "evap" in n:
        return "evaporated-milk"
    if "cream" in n:
        return "cream"
    if "butter bean" in n or "butterbean" in n:
        return "butter-bean"
    if "butter" in n:
        return "butter"
    if "milk" in n:
        return "milk"
    if "manchego" in n or "mancgego" in n:
        return "manchego"
    if "anchov" in n or "boqueron" in n:
        return "anchovy"
    if "jamon" in n or "jamón" in n:
        if "iberico" in n:
            return "jamon-iberico"
        if "serrano" in n:
            return "jamon-serrano"
        return "jamon"
    if "chorizo" in n:
        return "chorizo"
    if "hanger" in n or "tenderloin" in n:
        return "hanger"
    if "minced beef" in n or "beef mince" in n or n == "beef":
        return "minced-beef"
    if "minced pork" in n or n == "pork mince":
        return "minced-pork"
    if "pork belly" in n:
        return "pork-belly"
    if "pork chop" in n or n == "pork":
        return "pork-chop"
    if "bacon" in n:
        return "bacon"
    if "chicken breast" in n:
        return "chicken-breast"
    if "chicken" in n and "stock" not in n and "broth" not in n:
        return "chicken"
    if "chicken stock" in n or "chicken broth" in n:
        return "chicken-stock"
    if "barramundi" in n:
        return "barramundi"
    if "sole" in n:
        return "sole"
    if "scallop" in n:
        return "scallop"
    if "mussel" in n:
        return "mussel"
    if "clam" in n:
        return "clam"
    if "octopus" in n or "pulpo" in n:
        return "octopus"
    if "prawn" in n or "shrimp" in n or "shirmp" in n:
        return "prawn"
    if "mushroom" in n:
        return "mushroom"
    if "baby carrot" in n or "bb carrot" in n:
        return "baby-carrot"
    if "carrot" in n:
        return "carrot"
    if "broccolini" in n:
        return "broccolini"
    if "mesclun" in n or "mix salad" in n or "mixed salad" in n:
        return "mesclun"
    if "frisee" in n or "freese" in n or "freisee" in n:
        return "frisee"
    if "lemon juice" in n or n == "lemon juice":
        return "lemon-juice"
    if "lemon" in n:
        return "lemon"
    if "orange" in n:
        return "orange"
    if "eggplant" in n or "aubergine" in n:
        return "eggplant"
    if "asparagus" in n:
        return "asparagus"
    if "fine bean" in n:
        return "fine-beans"
    if "spaghetti" in n or "pasta" in n:
        return "spaghetti"
    if "noodle" in n:
        return "noodles"
    if "cornstarch" in n or "cornstartch" in n:
        return "cornstarch"
    if "stock" in n or "broth" in n:
        return "vegetable-broth" if "vegetable" in n else "stock"
    if "fig" in n:
        return "fig-jam"
    if "tuna" in n:
        return "tuna"
    if "cabbage" in n:
        return "cabbage"
    if "spinach" in n:
        return "spinach"
    if "pea" in n:
        return "peas"
    if "ginger" in n:
        return "ginger"
    if "nutmeg" in n:
        return "nutmeg"
    if "vanilla" in n:
        return "vanilla"
    if "rabbit" in n:
        return "rabbit"
    if "blood sausage" in n:
        return "blood-sausage"
    if "squid" in n or "calamar" in n:
        return "squid"
    if "wrapping" in n:
        return "wrapping-sheet"
    if "wing" in n:
        return "chicken-wing"
    if "polenta" in n:
        return "polenta-meal"
    if "iberico" in n and ("loin" in n or "tenderloin" in n or "solomillo" in n):
        return "iberico-loin"
    return None


def product_slugs(name_norm):
    """Ingredient slugs a catalogue line belongs to. Exclusive except where noted."""
    n = name_norm
    if not n:
        return []
    if is_non_food(n):
        return []
    found = []

    def add(slug):
        if slug not in found:
            found.append(slug)

    if re.search(r"\begg\b", n) and "eggplant" not in n and "plant" not in n:
        add("egg")
    if "garlic powder" in n:
        add("garlic-powder")
    elif re.search(r"\bgarlic\b", n):
        add("garlic")
    if "onion powder" in n:
        add("onion-powder")
    elif "shallot" in n:
        add("shallot")
    elif "onion red" in n or "red onion" in n:
        add("red-onion")
    elif re.search(r"\bonion\b", n):
        add("onion")
    if "tomato cherry" in n or "cherry tomato" in n:
        add("cherry-tomato")
    elif "concentrate" in n or "tomato paste" in n:
        add("tomato-paste")
    elif "peeled" in n and "tomato" in n:
        add("peeled-tomato")
    elif "tomato juice" in n:
        add("tomato-juice")
    elif "roma" in n and "tomato" in n:
        add("roma-tomato")
    elif re.search(r"\btomato\b", n):
        add("tomato")
    if re.search(r"\bpotato\b", n):
        add("potato")
    if "cucumber" in n:
        add("cucumber")
    if "avocado" in n:
        add("avocado")
    if "padron" in n:
        add("padron")
    if "piquillo" in n or "pquillo" in n or "roasted whole red pimiento" in n:
        add("piquillo")
    if n.startswith("pepper red"):
        add("bell-pepper-red")
        add("bell-pepper")
    elif n.startswith("pepper yellow"):
        add("bell-pepper-yellow")
        add("bell-pepper")
    elif n.startswith("pepper green"):
        add("bell-pepper-green")
        add("bell-pepper")
    if "black olive" in n:
        add("black-olive")
    if "green olive" in n or "gordal" in n or "queen olive" in n:
        add("green-olive")
    if "extra virgin" in n or "pomace" in n or "pure olive" in n or n.startswith("olive oil"):
        add("olive-oil")
    if "cooking oil" in n:
        add("vegetable-oil")
    if "sherry vinegar" in n or (n.startswith("vinegar sherry") or "vinegar sherry" in n):
        add("sherry-vinegar")
    if "balsamic glaze" in n or ( "balsamic" in n and "glaze" in n):
        add("balsamic-glaze")
    elif "balsamic" in n:
        add("balsamic-vinegar")
    if "apple cider" in n:
        add("apple-cider-vinegar")
    if "red wine" in n and "vinegar" in n:
        add("red-wine-vinegar")
    if "white wine" in n and "vinegar" not in n:
        add("white-wine")
    if "red wine" in n and "vinegar" not in n:
        add("red-wine")
    if "bomba" in n:
        add("bomba-rice")
    if "thai rice" in n:
        add("thai-rice")
    if "paprika smoked" in n or "smoked paprika" in n:
        add("paprika-smoked")
    elif "paprika" in n and "hot" in n:
        add("paprika-hot")
    elif "paprika" in n:
        add("paprika")
    if "saffron" in n:
        add("saffron")
    if "kosher salt" in n or n.startswith("salt"):
        add("salt")
    if "black pepper" in n:
        add("black-pepper")
    if "parsley chinese" in n or "parsley flat" in n:
        add("parsley-fresh")
    elif n.startswith("parsley"):
        add("parsley-dried")
    if "rosemary" in n and "flakes" not in n and "1 kg" not in n and "1kg" not in n:
        add("rosemary-fresh")
    if "rosemary" in n and ("flakes" in n or "1 kg" in n or "1kg" in n or n.startswith("rosemary 1")):
        add("rosemary-dried")
    if n == "rosemary 1 kg" or n.startswith("rosemary 1"):
        add("rosemary-dried")
    if "oregano flakes" in n or n.startswith("oregano flakes") or n.startswith("oregano 1"):
        add("oregano-dried")
    elif n == "oregano" or n.startswith("oregano "):
        add("oregano-fresh")
    if n.startswith("thyme"):
        add("thyme-fresh")
    if "cumin" in n:
        add("cumin")
    if "coriander" in n:
        add("coriander-ground")
    if "bay leaf" in n or "bay leaves" in n:
        add("bay-leaf")
    if "cinnamon" in n:
        add("cinnamon")
    if "chilli flake" in n or "chili flake" in n:
        add("chilli-flakes")
    if "chilli red" in n or "chili red" in n:
        add("red-chilli")
    if "jalapeno" in n:
        add("jalapeno")
    if "bread crumb" in n:
        add("breadcrumbs")
    if "baguette" in n:
        add("baguette")
    if n == "flour" or n.startswith("flour "):
        add("flour")
    if "icing sugar" in n:
        add("icing-sugar")
    if "brown sugar" in n:
        add("brown-sugar")
    if n.startswith("sugar"):
        add("sugar")
    if "honey" in n:
        add("honey")
    if "dijon" in n or "mustard" in n:
        add("mustard")
    if re.search(r"\bcapers?\b", n):
        add("capers")
    if "cream cheese" in n:
        add("cream-cheese")
    if "condensed" in n:
        add("condensed-milk")
    if re.search(r"\bcream\b", n) and "cheese" not in n and "creamer" not in n:
        add("cream")
    if "creamer" in n:
        add("creamer")
    if re.search(r"\bbutter\b", n) and "bean" not in n and "butternut" not in n and "lettuce" not in n:
        add("butter")
    if re.search(r"\bmilk\b", n) and "condensed" not in n and "cream" not in n:
        add("milk")
    if "manchego" in n:
        add("manchego")
    if "anchovy" in n or "boqueron" in n:
        add("anchovy")
    if "jamon" in n or "serrano" in n:
        if "serrano" in n:
            add("jamon-serrano")
            add("jamon")
        else:
            add("jamon-iberico")
            add("jamon")
    if "chorizo" in n:
        add("chorizo")
    if "hanger" in n:
        add("hanger")
    if "solomillo" in n or ("iberico" in n and "loin" in n):
        add("iberico-loin")
    if "rib-eye" in n or "ribeye" in n:
        if "rubia" in n or "boneless" in n:
            add("ribeye-los")
        else:
            add("ribeye")
    if "mince beef" in n or "minced beef" in n:
        add("minced-beef")
    if "mince pork" in n or "minced pork" in n:
        add("minced-pork")
    if "pork belly" in n:
        add("pork-belly")
    if "bacon" in n:
        add("bacon")
    if "chicken breast" in n:
        add("chicken-breast")
    if "spring chicken" in n:
        add("chicken")
    if "barramundi" in n:
        add("barramundi")
    if "sole" in n:
        add("sole")
    if "scallop" in n:
        add("scallop")
    if "mussel" in n:
        add("mussel")
    if "manila clam" in n:
        add("clam")
    if "octopus" in n:
        add("octopus")
    if "shrimp" in n or "prawn" in n:
        add("prawn")
    if "mushroom" in n:
        add("mushroom")
    if "carrot baby" in n or "baby carrot" in n or n.startswith("carrot baby"):
        add("baby-carrot")
    elif n == "carrot" or n.startswith("carrot "):
        add("carrot")
    if "broccolini" in n:
        add("broccolini")
    if "mesclun" in n:
        add("mesclun")
    if "freisee" in n or "frisee" in n:
        add("frisee")
    if "lemon juice" in n:
        add("lemon-juice")
    elif n.startswith("lemon"):
        add("lemon")
    if n.startswith("orange"):
        add("orange")
    if "eggplant" in n:
        add("eggplant")
    if "asparagus" in n:
        add("asparagus")
    if "bean fine" in n or "fine bean" in n:
        add("fine-beans")
    if "spaghetti" in n:
        add("spaghetti")
    if "noodle" in n:
        add("noodles")
    if "cornstarch" in n:
        add("cornstarch")
    if "chicken broth" in n or "chicken stock" in n:
        add("chicken-stock")
    if "fig jam" in n:
        add("fig-jam")
    if "tuna" in n:
        add("tuna")
    if "ginger" in n and "beer" not in n:
        add("ginger")
    if "mayonnaise" in n:
        add("mayonnaise")
    if "black cod" in n:
        add("cod")
    if "whipping" in n:
        add("cream")
    return found


DISPLAY = {
    "egg-yolk": ("Egg yolk", "dairy-eggs", False),
    "egg": ("Egg", "dairy-eggs", True),
    "garlic-powder": ("Garlic powder", "spices", False),
    "garlic": ("Garlic", "vegetables", True),
    "onion-powder": ("Onion powder", "spices", False),
    "spring-onion": ("Spring onion", "vegetables", False),
    "red-onion": ("Red onion", "vegetables", False),
    "shallot": ("Shallot", "vegetables", False),
    "onion": ("Onion", "vegetables", True),
    "cherry-tomato": ("Cherry tomato", "vegetables", False),
    "tomato-paste": ("Tomato paste", "dry-goods", False),
    "peeled-tomato": ("Peeled tomato", "dry-goods", False),
    "tomato-juice": ("Tomato juice", "dry-goods", False),
    "roma-tomato": ("Roma tomato", "vegetables", False),
    "tomato": ("Tomato", "vegetables", True),
    "potato": ("Potato", "vegetables", False),
    "cucumber": ("Cucumber", "vegetables", False),
    "avocado": ("Avocado", "vegetables", False),
    "padron": ("Padrón pepper", "vegetables", False),
    "piquillo": ("Piquillo pepper", "vegetables", False),
    "bell-pepper-red": ("Red bell pepper", "vegetables", False),
    "bell-pepper-yellow": ("Yellow bell pepper", "vegetables", False),
    "bell-pepper-green": ("Green bell pepper", "vegetables", False),
    "bell-pepper": ("Bell pepper", "vegetables", False),
    "black-olive": ("Black olive", "dry-goods", False),
    "green-olive": ("Green olive", "dry-goods", False),
    "olive-mix": ("Olive", "dry-goods", False),
    "olive-oil": ("Olive oil", "oils-vinegar-wine", True),
    "vegetable-oil": ("Vegetable oil", "oils-vinegar-wine", False),
    "sherry-vinegar": ("Sherry vinegar", "oils-vinegar-wine", False),
    "balsamic-vinegar": ("Balsamic vinegar", "oils-vinegar-wine", False),
    "balsamic-glaze": ("Balsamic glaze", "oils-vinegar-wine", False),
    "apple-cider-vinegar": ("Apple cider vinegar", "oils-vinegar-wine", False),
    "white-wine-vinegar": ("White wine vinegar", "oils-vinegar-wine", False),
    "red-wine-vinegar": ("Red wine vinegar", "oils-vinegar-wine", False),
    "white-vinegar": ("White vinegar", "oils-vinegar-wine", False),
    "vinegar": ("Vinegar", "oils-vinegar-wine", False),
    "white-wine": ("White wine", "oils-vinegar-wine", False),
    "red-wine": ("Red wine", "oils-vinegar-wine", False),
    "brandy": ("Brandy", "oils-vinegar-wine", False),
    "bomba-rice": ("Bomba rice", "dry-goods", False),
    "thai-rice": ("Thai rice", "dry-goods", False),
    "paprika-smoked": ("Smoked paprika", "spices", False),
    "paprika-hot": ("Hot paprika", "spices", False),
    "paprika": ("Paprika", "spices", False),
    "saffron": ("Saffron", "spices", False),
    "salt-cod": ("Salt cod", "seafood", False),
    "cod": ("Cod", "seafood", False),
    "salt": ("Salt", "spices", True),
    "white-pepper": ("White pepper", "spices", False),
    "black-pepper": ("Black pepper", "spices", False),
    "parsley-fresh": ("Parsley", "vegetables", False),
    "parsley-dried": ("Dried parsley", "spices", False),
    "rosemary-fresh": ("Rosemary", "vegetables", False),
    "rosemary-dried": ("Dried rosemary", "spices", False),
    "thyme-dried": ("Dried thyme", "spices", False),
    "thyme-fresh": ("Thyme", "vegetables", False),
    "oregano-fresh": ("Oregano", "vegetables", False),
    "oregano-dried": ("Dried oregano", "spices", False),
    "cumin": ("Cumin", "spices", False),
    "coriander-ground": ("Ground coriander", "spices", False),
    "coriander-fresh": ("Coriander", "vegetables", False),
    "bay-leaf": ("Bay leaf", "spices", False),
    "cinnamon": ("Cinnamon", "spices", False),
    "chilli-flakes": ("Chilli flakes", "spices", False),
    "red-chilli": ("Red chilli", "vegetables", False),
    "thai-chilli": ("Thai chilli", "vegetables", False),
    "jalapeno": ("Jalapeño", "vegetables", False),
    "breadcrumbs": ("Breadcrumbs", "dry-goods", False),
    "baguette": ("Baguette", "dry-goods", False),
    "bread": ("Bread", "dry-goods", False),
    "flour": ("Flour", "dry-goods", False),
    "icing-sugar": ("Icing sugar", "dry-goods", False),
    "brown-sugar": ("Brown sugar", "dry-goods", False),
    "sugar": ("Sugar", "dry-goods", False),
    "honey": ("Honey", "dry-goods", False),
    "mustard": ("Mustard", "dry-goods", False),
    "capers": ("Capers", "dry-goods", False),
    "cream-cheese": ("Cream cheese", "dairy-eggs", False),
    "condensed-milk": ("Condensed milk", "dairy-eggs", False),
    "evaporated-milk": ("Evaporated milk", "dairy-eggs", False),
    "creamer": ("Creamer", "dairy-eggs", False),
    "cream": ("Cream", "dairy-eggs", False),
    "butter-bean": ("Butter bean", "dry-goods", False),
    "butter": ("Butter", "dairy-eggs", False),
    "milk": ("Milk", "dairy-eggs", False),
    "manchego": ("Manchego", "dairy-eggs", False),
    "anchovy": ("Anchovy", "seafood", False),
    "jamon-iberico": ("Jamón ibérico", "meat", False),
    "jamon-serrano": ("Jamón serrano", "meat", False),
    "jamon": ("Jamón", "meat", False),
    "chorizo": ("Chorizo", "meat", False),
    "hanger": ("Hanger steak", "meat", False),
    "iberico-loin": ("Ibérico pork loin", "meat", False),
    "ribeye-los": ("Rib-eye", "meat", False),
    "ribeye": ("Prime rib-eye", "meat", False),
    "minced-beef": ("Minced beef", "meat", False),
    "minced-pork": ("Minced pork", "meat", False),
    "pork-belly": ("Pork belly", "meat", False),
    "pork-chop": ("Pork chop", "meat", False),
    "bacon": ("Bacon", "meat", False),
    "chicken-breast": ("Chicken breast", "meat", False),
    "chicken": ("Chicken", "meat", False),
    "chicken-stock": ("Chicken stock", "dry-goods", False),
    "barramundi": ("Barramundi", "seafood", False),
    "sole": ("Sole", "seafood", False),
    "scallop": ("Scallop", "seafood", False),
    "mussel": ("Mussel", "seafood", False),
    "clam": ("Manila clam", "seafood", False),
    "octopus": ("Octopus", "seafood", False),
    "prawn": ("Prawn", "seafood", False),
    "mushroom": ("Mushroom", "vegetables", False),
    "baby-carrot": ("Baby carrot", "vegetables", False),
    "carrot": ("Carrot", "vegetables", False),
    "broccolini": ("Broccolini", "vegetables", False),
    "mesclun": ("Mesclun", "vegetables", False),
    "frisee": ("Frisée", "vegetables", False),
    "lemon-juice": ("Lemon juice", "vegetables", False),
    "lemon": ("Lemon", "vegetables", False),
    "orange": ("Orange", "vegetables", False),
    "eggplant": ("Eggplant", "vegetables", False),
    "asparagus": ("Asparagus", "vegetables", False),
    "fine-beans": ("Fine beans", "vegetables", False),
    "spaghetti": ("Spaghetti", "dry-goods", False),
    "noodles": ("Noodles", "dry-goods", False),
    "cornstarch": ("Cornstarch", "dry-goods", False),
    "vegetable-broth": ("Vegetable broth", "dry-goods", False),
    "stock": ("Stock", "dry-goods", False),
    "fig-jam": ("Fig jam", "dry-goods", False),
    "tuna": ("Tuna", "seafood", False),
    "cabbage": ("Cabbage", "vegetables", False),
    "spinach": ("Spinach", "vegetables", False),
    "peas": ("Peas", "vegetables", False),
    "ginger": ("Ginger", "vegetables", False),
    "nutmeg": ("Nutmeg", "spices", False),
    "vanilla": ("Vanilla", "dry-goods", False),
    "rabbit": ("Rabbit", "meat", False),
    "blood-sausage": ("Blood sausage", "meat", False),
    "squid": ("Squid", "seafood", False),
    "wrapping-sheet": ("Wrapping sheet", "dry-goods", False),
    "chicken-wing": ("Chicken wing", "meat", False),
    "polenta-meal": ("Polenta", "dry-goods", False),
    "mayonnaise": ("Mayonnaise", "dry-goods", False),
    "water": ("Water", "dry-goods", False),
}


def guess_group(name):
    n = name.lower()
    checks = [
        ("seafood", ("prawn", "shrimp", "fish", "clam", "mussel", "octopus", "anchov", "cod", "salmon", "scallop", "squid", "tuna", "seafood")),
        ("meat", ("beef", "pork", "chicken", "chorizo", "jamon", "ham", "bacon", "rabbit", "sausage", "wing", "lamb", "rib", "steak")),
        ("dairy-eggs", ("egg", "milk", "cream", "cheese", "butter")),
        ("oils-vinegar-wine", ("oil", "vinegar", "wine", "brandy")),
        ("spices", ("salt", "pepper", "paprika", "saffron", "cumin", "oregano", "thyme", "rosemary", "cinnamon", "spice", "seasoning", "flake", "powder")),
        ("vegetables", ("tomato", "onion", "garlic", "potato", "pepper", "cucumber", "lettuce", "carrot", "mushroom", "parsley", "chilli", "chili", "avocado", "lemon", "lime", "orange")),
    ]
    for group, keys in checks:
        if any(key in n for key in keys):
            return group
    return "dry-goods"


def pack_note_grams_or_ml(name):
    """A pack size written in the product name, used only when the sheet has no usable-amount columns."""
    match = re.search(r"(\d+(?:\.\d+)?)\s*(kg|g|ml|l|lt)\b", name, re.I)
    if not match:
        return None, None
    amount = float(match.group(1))
    unit = match.group(2).lower()
    if unit == "lt":
        unit = "l"
    return amount, unit


def parse_products(ws):
    products = []
    supplier_id = None
    index = 0
    for row in ws.iter_rows(values_only=True):
        raw_name = text(row[0] if len(row) > 0 else None)
        if not raw_name or raw_name == "Supplier":
            continue
        header = raw_name.strip().upper()
        if header in HEADER_TO_SUPPLIER:
            supplier_id = HEADER_TO_SUPPLIER[header]
            continue
        if supplier_id is None:
            continue
        index += 1
        price = num(row[1] if len(row) > 1 else None)
        pack = text(row[3] if len(row) > 3 else None)
        confirmed = text(row[4] if len(row) > 4 else None)
        note = text(row[5] if len(row) > 5 else None)
        usable_amount = num(row[6] if len(row) > 6 else None)
        usable_unit_raw = text(row[7] if len(row) > 7 else None).lower()
        usable_unit = {"kg": "kg", "g": "g", "gr": "g", "ml": "ml", "l": "l", "lt": "l"}.get(usable_unit_raw)
        name_en, name_zh = split_names(raw_name)
        name_en = re.sub(r"\(\s*\)", "", name_en)
        name_en = re.sub(r"\s+", " ", name_en).strip(" -/")
        name_zh = clean_zh(name_zh)
        if not name_zh and confirmed_flag(confirmed) is None:
            name_zh = clean_zh("".join(CJK.findall(confirmed)) or None)
        flags = []
        if is_non_food(raw_name):
            flags.append("non-food")
        if price is None:
            flags.append("missing-price")
        elif price >= NONSENSE_PRICE:
            flags.append("nonsense-price")
        if confirmed_flag(confirmed):
            flags.append("unmatched")
        if usable_amount is None and pack.lower() in {"pk", "pkt", "bag", "tray", "tin", "jar", "box", "btl", "bottle", "can", "pack"}:
            extracted_amount, extracted_unit = pack_note_grams_or_ml(raw_name)
            if extracted_amount and extracted_unit:
                usable_amount = extracted_amount
                usable_unit = extracted_unit
                extra = "Pack size taken from the product name."
                note = f"{note} {extra}".strip() if note else extra
        products.append(
            {
                "id": f"prod-{supplier_id}-{index:03d}",
                "supplierId": supplier_id,
                "name": raw_name,
                "nameEn": name_en,
                "nameZh": name_zh,
                "packLabel": pack or None,
                "price": price,
                "usableAmount": usable_amount,
                "usableUnit": usable_unit,
                "note": note or None,
                "confirmed": confirmed or None,
                "flags": flags,
                "countPerKg": None,
                "gramsPerEach": None,
            }
        )
    return products


def blank_ingredient(slug, name, group, favorite=False):
    return {
        "id": f"ing-{slug}",
        "slug": slug,
        "name": name,
        "nameZh": None,
        "group": group,
        "usualSpillagePercent": 0,
        "favorite": favorite,
        "preferredProductId": None,
        "productIds": [],
        "preparationDishId": None,
        "free": slug == "water",
        "note": None,
        "tablespoonMl": None,
        "teaspoonMl": None,
        "cupMl": None,
        "pinchMl": None,
        "gramsPerLitre": None,
    }


def ensure_ingredient(ingredients, slug, fallback_name=None):
    if slug in ingredients:
        return ingredients[slug]
    if slug in DISPLAY:
        name, group, favorite = DISPLAY[slug]
    else:
        name = fallback_name or slug.replace("-", " ").capitalize()
        group = guess_group(name)
        favorite = False
    ingredients[slug] = blank_ingredient(slug, name, group, favorite)
    return ingredients[slug]


def parse_size(size_raw, unit_cell):
    label = size_raw.strip()
    if not label:
        return None, None, None
    match = re.search(r"(\d+(?:\.\d+)?)\s*(g|kg|ml|l|lb|lbs|oz|pcs|pc)\b", label, re.I)
    if match:
        unit = canonical_unit(match.group(2))
        return num(match.group(1)), unit, label
    amount = num(label)
    if amount is None:
        return None, None, label
    cell = canonical_unit(unit_cell)
    # The blank form prints OZ in this cell. Only trust a unit somebody changed.
    if cell in {"g", "kg", "ml", "l"}:
        return amount, cell, label
    return amount, None, label


def extract_method(rows, total_index):
    lines = []
    for row in rows[total_index + 1 :]:
        cells = [text(cell) for cell in row if text(cell)]
        if not cells:
            continue
        line = re.sub(r"\s+", " ", " ".join(cells)).strip()
        if not line:
            continue
        if line.lower().startswith("prepared by"):
            continue
        if re.fullmatch(r"[\d.,]+", line):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def parse_dish(sheet, ws):
    rows = [tuple(row) for row in ws.iter_rows(values_only=True)]
    title = ""
    portions = None
    size_raw = ""
    unit_cell = ""
    menu_price = None
    header_index = None
    for index, row in enumerate(rows):
        label = text(row[0] if row else None)
        if label == "Menu Item":
            title = text(row[2] if len(row) > 2 else None)
        if label.startswith("Number of Portions"):
            portions = num(row[2] if len(row) > 2 else None)
            unit_cell = text(row[4] if len(row) > 4 else None)
            size_raw = text(row[9] if len(row) > 9 else None)
        if label.startswith("Cost Per Portion"):
            menu_price = num(row[6] if len(row) > 6 else None)
        if label.startswith("Ingredients"):
            header_index = index
            break
    if not title:
        # A title sometimes sits on the form-name row.
        for row in rows:
            if text(row[0] if row else None).startswith("FOOD COST") and len(row) > 10:
                title = text(row[10])
                if title:
                    break
    if not title:
        title = sheet.strip()
    portion_amount, portion_unit, portion_label = parse_size(size_raw, unit_cell)
    lines = []
    total_index = len(rows) - 1
    if header_index is not None:
        for index, row in enumerate(rows[header_index + 1 :], start=header_index + 1):
            joined = " ".join(text(cell) for cell in row).lower()
            name = text(row[0] if row else None)
            if "total cost" in joined or name.lower().startswith("total"):
                total_index = index
                break
            quantity = num(row[1] if len(row) > 1 else None)
            if not name or quantity is None:
                if not name and quantity is None:
                    # Keep going: some sheets leave a gap before the total.
                    continue
                continue
            unit_raw = text(row[2] if len(row) > 2 else None)
            supplier = text(row[3] if len(row) > 3 else None)
            yield_value = num(row[7] if len(row) > 7 else None)
            unit = canonical_unit(unit_raw) or unit_raw.strip().lower()
            note = None
            if unit_raw.strip().lower() in {"tips", "tbps", "tabp", "ec"}:
                note = f"Sheet unit “{unit_raw.strip()}” is read as {unit}."
            spillage, yolk_note = spillage_from_yield(yield_value, name)
            if yolk_note:
                note = yolk_note
            lines.append(
                {
                    "sourceName": name,
                    "quantity": quantity,
                    "unit": unit or "g",
                    "sourceUnit": unit_raw,
                    "sourceSupplier": supplier,
                    "spillagePercent": spillage,
                    "note": note,
                    "yield": yield_value,
                }
            )
    method = extract_method(rows, total_index if header_index is not None else len(rows))
    return {
        "sheet": sheet,
        "title": title,
        "portions": portions if isinstance(portions, (int, float)) and portions > 0 else None,
        "portionAmount": portion_amount,
        "portionUnit": portion_unit,
        "portionLabel": portion_label,
        "menuPrice": menu_price if isinstance(menu_price, (int, float)) and menu_price > 0 else None,
        "method": method,
        "lines": lines,
    }


def spillage_from_yield(yield_value, ingredient_name):
    if yield_value is None:
        return 0, None
    try:
        value = float(yield_value)
    except (TypeError, ValueError):
        return 0, None
    if value <= 0 or value > 1:
        return 0, None
    if abs(value - 1) < 1e-9:
        return 0, None
    if "yolk" in ingredient_name.lower():
        return 0, (
            "The sheet's yield on egg yolk was not copied. A yolk is part of an egg, "
            "not spillage, and the old yield made the yolk cost more than one egg. "
            "This line is costed as one egg per yolk."
        )
    return round((1 - value) * 100, 1), None


def dish_id_for(sheet):
    return "dish-" + slugify(sheet)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: import-food-cost.py <workbook.xlsx> <out.json>")
    workbook_path, out_path = sys.argv[1], sys.argv[2]
    wb = load_workbook(workbook_path, data_only=True, read_only=True)
    products = parse_products(wb["All Ingredients"])
    parsed = []
    for sheet in wb.sheetnames:
        if sheet in SKIP_SHEETS:
            continue
        parsed.append(parse_dish(sheet, wb[sheet]))

    ingredients = {}
    for product in products:
        if "non-food" in product["flags"]:
            continue
        slugs = product_slugs(norm(product["nameEn"]))
        if not slugs:
            slug = "cat-" + product["id"].replace("prod-", "")
            ingredient = ensure_ingredient(ingredients, slug, display_name(product["nameEn"]))
            ingredient["productIds"].append(product["id"])
            if product["nameZh"] and not ingredient["nameZh"]:
                ingredient["nameZh"] = product["nameZh"]
            continue
        for slug in slugs:
            ingredient = ensure_ingredient(ingredients, slug)
            if product["id"] not in ingredient["productIds"]:
                ingredient["productIds"].append(product["id"])
            if product["nameZh"] and not ingredient["nameZh"]:
                ingredient["nameZh"] = product["nameZh"]

    # Egg yolk is bought as an egg.
    if "egg" in ingredients:
        yolk = ensure_ingredient(ingredients, "egg-yolk")
        for product_id in ingredients["egg"]["productIds"]:
            if product_id not in yolk["productIds"]:
                yolk["productIds"].append(product_id)

    ensure_ingredient(ingredients, "water")

    dishes = []
    votes = defaultdict(Counter)
    unmapped = []
    for item in parsed:
        category = category_for(item["sheet"])
        dish_id = dish_id_for(item["sheet"])
        dish = {
            "id": dish_id,
            "sheetName": item["sheet"].strip(),
            "name": display_name(item["title"]),
            "category": category,
            "portions": item["portions"],
            "portionAmount": item["portionAmount"],
            "portionUnit": item["portionUnit"],
            "portionLabel": item["portionLabel"],
            "menuPrice": item["menuPrice"],
            "method": item["method"],
            "lines": [],
        }
        for line_index, line in enumerate(item["lines"], start=1):
            name_norm = norm(line["sourceName"])
            component = component_sheet(name_norm, item["sheet"])
            supplier_raw = line["sourceSupplier"]
            slug = None
            component_id = None
            if component:
                component_id = dish_id_for(component)
                slug = "prep-" + slugify(component)
                ensure_ingredient(ingredients, slug, display_name(component))
            elif in_house(supplier_raw):
                slug = "house-" + slugify(name_norm)
                ingredient = ensure_ingredient(ingredients, slug, display_name(line["sourceName"]))
                ingredient["group"] = "made-in-house"
                if not ingredient.get("houseNote"):
                    ingredient["houseNote"] = (
                        "The sheet says this is made in house, and no preparation sheet uses this name."
                    )
            else:
                slug = recipe_slug(name_norm, line["unit"], item["sheet"])
                if slug is None:
                    slug = "recipe-" + slugify(name_norm)
                    ensure_ingredient(ingredients, slug, display_name(line["sourceName"]))
                    unmapped.append((item["sheet"], line["sourceName"], slug))
                else:
                    ensure_ingredient(ingredients, slug)
            ingredient = ingredients[slug]
            supplier_id = supplier_id_from_recipe(supplier_raw)
            if supplier_id and not component_id:
                votes[slug][supplier_id] += 1
            dish["lines"].append(
                {
                    "id": f"{dish_id}-line-{line_index}",
                    "ingredientId": ingredient["id"],
                    "componentDishId": component_id,
                    "quantity": line["quantity"],
                    "unit": line["unit"],
                    "spillagePercent": line["spillagePercent"],
                    "sourceName": line["sourceName"],
                    "sourceSupplier": supplier_raw or None,
                    "sourceUnit": line["sourceUnit"] or None,
                    "note": line["note"],
                }
            )
        dishes.append(dish)

    # Preparations and any dish used inside another dish are kitchen ingredients.
    referenced = {line["componentDishId"] for dish in dishes for line in dish["lines"] if line["componentDishId"]}
    for dish in dishes:
        if dish["category"] != "preparations" and dish["id"] not in referenced:
            continue
        slug = "prep-" + dish["id"].replace("dish-", "")
        ingredient = ensure_ingredient(ingredients, slug, dish["name"])
        ingredient["group"] = "made-in-house"
        ingredient["preparationDishId"] = dish["id"]
        ingredient["name"] = dish["name"]

    spillages = defaultdict(list)
    for dish in dishes:
        for line in dish["lines"]:
            spillages[line["ingredientId"]].append(line["spillagePercent"])
    for ingredient in ingredients.values():
        values = spillages.get(ingredient["id"], [])
        if not values:
            continue
        ingredient["usualSpillagePercent"] = Counter(values).most_common(1)[0][0]

    for slug, ingredient in ingredients.items():
        tally = votes.get(slug)
        if not tally or len(ingredient["productIds"]) <= 1:
            continue
        ranking = tally.most_common(2)
        if len(ranking) == 2 and ranking[0][1] == ranking[1][1]:
            continue
        supplier_id = ranking[0][0]
        choices = [
            product["id"]
            for product in products
            if product["id"] in ingredient["productIds"]
            and product["supplierId"] == supplier_id
            and "missing-price" not in product["flags"]
            and "nonsense-price" not in product["flags"]
        ]
        if len(choices) == 1:
            ingredient["preferredProductId"] = choices[0]

    # Drop the helper slug field and house note into note-like field the app ignores if unknown.
    ingredient_list = []
    for ingredient in ingredients.values():
        ingredient.pop("slug", None)
        house_note = ingredient.pop("houseNote", None)
        if house_note:
            ingredient["note"] = house_note
        ingredient_list.append(ingredient)
    ingredient_list.sort(key=lambda item: (item["group"], item["name"].lower()))

    database = {
        "currency": "HKD",
        "targetFoodCost": 0.3,
        "recentIngredientIds": [],
        "suppliers": [
            {"id": sid, "name": name, "sort": index}
            for index, (sid, name, _header) in enumerate(SUPPLIERS)
        ],
        "products": products,
        "ingredients": ingredient_list,
        "dishes": dishes,
    }
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(database, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print(f"products {len(products)}")
    print(f"ingredients {len(ingredient_list)}")
    print(f"dishes {len(dishes)}")
    print(f"recipe lines {sum(len(dish['lines']) for dish in dishes)}")
    print(f"with method {sum(1 for dish in dishes if dish['method'])}")
    print(f"unmapped names {len(unmapped)}")
    for sheet, name, slug in unmapped:
        print(f"  UNMAPPED {sheet} :: {name} -> {slug}")


if __name__ == "__main__":
    main()
