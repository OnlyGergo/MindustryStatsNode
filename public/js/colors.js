function colors(color) { //Creator: Mindserv list
    color = color.toLowerCase();
    const colors = {
        "": "white",

        white: "white",
        lightgray: "#bfbfbfff",
        gray: "#7f7f7fff",
        grey: "#7f7f7fff",
        darkgray: "#3f3f3fff",
        black: "black",
        clear: "black",

        blue: "#0000ffff",
        navy: "#00007fff",
        royal: "#4169e1ff",
        slate: "#708090ff",
        sky: "#87ceebff",
        cyan: "#00ffffff",
        teal: "#007f7fff",

        green: "#00ff00ff",
        acid: "#7fff00ff",
        lime: "#32cd32ff",
        forest: "#228b22ff",
        olive: "#6b8e23ff",

        yellow: "#ffff00ff",
        gold: "#ffd700ff",
        goldenrod: "#daa520ff",
        orange: "#ffa500ff",

        brown: "#8b4513ff",
        tan: "#d2b48cff",
        brick: "#b22222ff",

        red: "#ff0000ff",
        scarlet: "#ff341cff",
        coral: "#ff7f50ff",
        salmon: "#fa8072ff",
        pink: "#ff69b4ff",
        magenta: "#7f007fff",

        purple: "#a020f0ff",
        violet: "#ee82eeff",
        maroon: "#b03060ff",

        // alias?
        crimson: "#ff341cff", // scarlet

        // special
        // see: https://github.com/Anuken/Mindustry/blob/61e9ffb7e87661b866196ad38e1100c406b53bc2/core/src/mindustry/core/UI.java#L125-L128
        // https://github.com/Anuken/Mindustry/blob/b7948852b30beb3bc71893e50c1d1250726ad0dd/core/src/mindustry/graphics/Pal.java
        accent: "#ffcb39ff",
        unlaunched: "#8982edff",
        stat: "#ffd37fff"
    };

    if (color[0] === "#") {
        return color;
    } else if (colors[color]) {
        return colors[color];
    }

    return undefined;
}

function renderColor(str) {
    if (!str) return str;
    /*return str.replace(
        /\[([a-zA-Z0-9#]*?)\](.*?)(?=(\[|\n|\]|$))/g,
        (_match, color, text) => {
            let resolved_color = colors(color);
            if (resolved_color === undefined) {
                return _match;
            }
            return `<font style="color: ${resolved_color}">${text}</font>`;
        }
    );*/

    // Remove colors as contrast issues
    return str.replace(/\[([a-zA-Z0-9#]*?)\]/g, '');
}