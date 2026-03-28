#!/usr/bin/env bun
// @bun
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __require = import.meta.require;

// node_modules/commander/lib/error.js
var require_error = __commonJS((exports) => {
  class CommanderError extends Error {
    constructor(exitCode, code, message) {
      super(message);
      Error.captureStackTrace(this, this.constructor);
      this.name = this.constructor.name;
      this.code = code;
      this.exitCode = exitCode;
      this.nestedError = undefined;
    }
  }

  class InvalidArgumentError extends CommanderError {
    constructor(message) {
      super(1, "commander.invalidArgument", message);
      Error.captureStackTrace(this, this.constructor);
      this.name = this.constructor.name;
    }
  }
  exports.CommanderError = CommanderError;
  exports.InvalidArgumentError = InvalidArgumentError;
});

// node_modules/commander/lib/argument.js
var require_argument = __commonJS((exports) => {
  var { InvalidArgumentError } = require_error();

  class Argument {
    constructor(name, description) {
      this.description = description || "";
      this.variadic = false;
      this.parseArg = undefined;
      this.defaultValue = undefined;
      this.defaultValueDescription = undefined;
      this.argChoices = undefined;
      switch (name[0]) {
        case "<":
          this.required = true;
          this._name = name.slice(1, -1);
          break;
        case "[":
          this.required = false;
          this._name = name.slice(1, -1);
          break;
        default:
          this.required = true;
          this._name = name;
          break;
      }
      if (this._name.length > 3 && this._name.slice(-3) === "...") {
        this.variadic = true;
        this._name = this._name.slice(0, -3);
      }
    }
    name() {
      return this._name;
    }
    _concatValue(value, previous) {
      if (previous === this.defaultValue || !Array.isArray(previous)) {
        return [value];
      }
      return previous.concat(value);
    }
    default(value, description) {
      this.defaultValue = value;
      this.defaultValueDescription = description;
      return this;
    }
    argParser(fn) {
      this.parseArg = fn;
      return this;
    }
    choices(values) {
      this.argChoices = values.slice();
      this.parseArg = (arg, previous) => {
        if (!this.argChoices.includes(arg)) {
          throw new InvalidArgumentError(`Allowed choices are ${this.argChoices.join(", ")}.`);
        }
        if (this.variadic) {
          return this._concatValue(arg, previous);
        }
        return arg;
      };
      return this;
    }
    argRequired() {
      this.required = true;
      return this;
    }
    argOptional() {
      this.required = false;
      return this;
    }
  }
  function humanReadableArgName(arg) {
    const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
    return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
  }
  exports.Argument = Argument;
  exports.humanReadableArgName = humanReadableArgName;
});

// node_modules/commander/lib/help.js
var require_help = __commonJS((exports) => {
  var { humanReadableArgName } = require_argument();

  class Help {
    constructor() {
      this.helpWidth = undefined;
      this.minWidthToWrap = 40;
      this.sortSubcommands = false;
      this.sortOptions = false;
      this.showGlobalOptions = false;
    }
    prepareContext(contextOptions) {
      this.helpWidth = this.helpWidth ?? contextOptions.helpWidth ?? 80;
    }
    visibleCommands(cmd) {
      const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
      const helpCommand = cmd._getHelpCommand();
      if (helpCommand && !helpCommand._hidden) {
        visibleCommands.push(helpCommand);
      }
      if (this.sortSubcommands) {
        visibleCommands.sort((a, b) => {
          return a.name().localeCompare(b.name());
        });
      }
      return visibleCommands;
    }
    compareOptions(a, b) {
      const getSortKey = (option) => {
        return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
      };
      return getSortKey(a).localeCompare(getSortKey(b));
    }
    visibleOptions(cmd) {
      const visibleOptions = cmd.options.filter((option) => !option.hidden);
      const helpOption = cmd._getHelpOption();
      if (helpOption && !helpOption.hidden) {
        const removeShort = helpOption.short && cmd._findOption(helpOption.short);
        const removeLong = helpOption.long && cmd._findOption(helpOption.long);
        if (!removeShort && !removeLong) {
          visibleOptions.push(helpOption);
        } else if (helpOption.long && !removeLong) {
          visibleOptions.push(cmd.createOption(helpOption.long, helpOption.description));
        } else if (helpOption.short && !removeShort) {
          visibleOptions.push(cmd.createOption(helpOption.short, helpOption.description));
        }
      }
      if (this.sortOptions) {
        visibleOptions.sort(this.compareOptions);
      }
      return visibleOptions;
    }
    visibleGlobalOptions(cmd) {
      if (!this.showGlobalOptions)
        return [];
      const globalOptions = [];
      for (let ancestorCmd = cmd.parent;ancestorCmd; ancestorCmd = ancestorCmd.parent) {
        const visibleOptions = ancestorCmd.options.filter((option) => !option.hidden);
        globalOptions.push(...visibleOptions);
      }
      if (this.sortOptions) {
        globalOptions.sort(this.compareOptions);
      }
      return globalOptions;
    }
    visibleArguments(cmd) {
      if (cmd._argsDescription) {
        cmd.registeredArguments.forEach((argument) => {
          argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
        });
      }
      if (cmd.registeredArguments.find((argument) => argument.description)) {
        return cmd.registeredArguments;
      }
      return [];
    }
    subcommandTerm(cmd) {
      const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
      return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + (args ? " " + args : "");
    }
    optionTerm(option) {
      return option.flags;
    }
    argumentTerm(argument) {
      return argument.name();
    }
    longestSubcommandTermLength(cmd, helper) {
      return helper.visibleCommands(cmd).reduce((max, command) => {
        return Math.max(max, this.displayWidth(helper.styleSubcommandTerm(helper.subcommandTerm(command))));
      }, 0);
    }
    longestOptionTermLength(cmd, helper) {
      return helper.visibleOptions(cmd).reduce((max, option) => {
        return Math.max(max, this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option))));
      }, 0);
    }
    longestGlobalOptionTermLength(cmd, helper) {
      return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
        return Math.max(max, this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option))));
      }, 0);
    }
    longestArgumentTermLength(cmd, helper) {
      return helper.visibleArguments(cmd).reduce((max, argument) => {
        return Math.max(max, this.displayWidth(helper.styleArgumentTerm(helper.argumentTerm(argument))));
      }, 0);
    }
    commandUsage(cmd) {
      let cmdName = cmd._name;
      if (cmd._aliases[0]) {
        cmdName = cmdName + "|" + cmd._aliases[0];
      }
      let ancestorCmdNames = "";
      for (let ancestorCmd = cmd.parent;ancestorCmd; ancestorCmd = ancestorCmd.parent) {
        ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
      }
      return ancestorCmdNames + cmdName + " " + cmd.usage();
    }
    commandDescription(cmd) {
      return cmd.description();
    }
    subcommandDescription(cmd) {
      return cmd.summary() || cmd.description();
    }
    optionDescription(option) {
      const extraInfo = [];
      if (option.argChoices) {
        extraInfo.push(`choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`);
      }
      if (option.defaultValue !== undefined) {
        const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
        if (showDefault) {
          extraInfo.push(`default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`);
        }
      }
      if (option.presetArg !== undefined && option.optional) {
        extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
      }
      if (option.envVar !== undefined) {
        extraInfo.push(`env: ${option.envVar}`);
      }
      if (extraInfo.length > 0) {
        return `${option.description} (${extraInfo.join(", ")})`;
      }
      return option.description;
    }
    argumentDescription(argument) {
      const extraInfo = [];
      if (argument.argChoices) {
        extraInfo.push(`choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`);
      }
      if (argument.defaultValue !== undefined) {
        extraInfo.push(`default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`);
      }
      if (extraInfo.length > 0) {
        const extraDescription = `(${extraInfo.join(", ")})`;
        if (argument.description) {
          return `${argument.description} ${extraDescription}`;
        }
        return extraDescription;
      }
      return argument.description;
    }
    formatHelp(cmd, helper) {
      const termWidth = helper.padWidth(cmd, helper);
      const helpWidth = helper.helpWidth ?? 80;
      function callFormatItem(term, description) {
        return helper.formatItem(term, termWidth, description, helper);
      }
      let output = [
        `${helper.styleTitle("Usage:")} ${helper.styleUsage(helper.commandUsage(cmd))}`,
        ""
      ];
      const commandDescription = helper.commandDescription(cmd);
      if (commandDescription.length > 0) {
        output = output.concat([
          helper.boxWrap(helper.styleCommandDescription(commandDescription), helpWidth),
          ""
        ]);
      }
      const argumentList = helper.visibleArguments(cmd).map((argument) => {
        return callFormatItem(helper.styleArgumentTerm(helper.argumentTerm(argument)), helper.styleArgumentDescription(helper.argumentDescription(argument)));
      });
      if (argumentList.length > 0) {
        output = output.concat([
          helper.styleTitle("Arguments:"),
          ...argumentList,
          ""
        ]);
      }
      const optionList = helper.visibleOptions(cmd).map((option) => {
        return callFormatItem(helper.styleOptionTerm(helper.optionTerm(option)), helper.styleOptionDescription(helper.optionDescription(option)));
      });
      if (optionList.length > 0) {
        output = output.concat([
          helper.styleTitle("Options:"),
          ...optionList,
          ""
        ]);
      }
      if (helper.showGlobalOptions) {
        const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
          return callFormatItem(helper.styleOptionTerm(helper.optionTerm(option)), helper.styleOptionDescription(helper.optionDescription(option)));
        });
        if (globalOptionList.length > 0) {
          output = output.concat([
            helper.styleTitle("Global Options:"),
            ...globalOptionList,
            ""
          ]);
        }
      }
      const commandList = helper.visibleCommands(cmd).map((cmd2) => {
        return callFormatItem(helper.styleSubcommandTerm(helper.subcommandTerm(cmd2)), helper.styleSubcommandDescription(helper.subcommandDescription(cmd2)));
      });
      if (commandList.length > 0) {
        output = output.concat([
          helper.styleTitle("Commands:"),
          ...commandList,
          ""
        ]);
      }
      return output.join(`
`);
    }
    displayWidth(str) {
      return stripColor(str).length;
    }
    styleTitle(str) {
      return str;
    }
    styleUsage(str) {
      return str.split(" ").map((word) => {
        if (word === "[options]")
          return this.styleOptionText(word);
        if (word === "[command]")
          return this.styleSubcommandText(word);
        if (word[0] === "[" || word[0] === "<")
          return this.styleArgumentText(word);
        return this.styleCommandText(word);
      }).join(" ");
    }
    styleCommandDescription(str) {
      return this.styleDescriptionText(str);
    }
    styleOptionDescription(str) {
      return this.styleDescriptionText(str);
    }
    styleSubcommandDescription(str) {
      return this.styleDescriptionText(str);
    }
    styleArgumentDescription(str) {
      return this.styleDescriptionText(str);
    }
    styleDescriptionText(str) {
      return str;
    }
    styleOptionTerm(str) {
      return this.styleOptionText(str);
    }
    styleSubcommandTerm(str) {
      return str.split(" ").map((word) => {
        if (word === "[options]")
          return this.styleOptionText(word);
        if (word[0] === "[" || word[0] === "<")
          return this.styleArgumentText(word);
        return this.styleSubcommandText(word);
      }).join(" ");
    }
    styleArgumentTerm(str) {
      return this.styleArgumentText(str);
    }
    styleOptionText(str) {
      return str;
    }
    styleArgumentText(str) {
      return str;
    }
    styleSubcommandText(str) {
      return str;
    }
    styleCommandText(str) {
      return str;
    }
    padWidth(cmd, helper) {
      return Math.max(helper.longestOptionTermLength(cmd, helper), helper.longestGlobalOptionTermLength(cmd, helper), helper.longestSubcommandTermLength(cmd, helper), helper.longestArgumentTermLength(cmd, helper));
    }
    preformatted(str) {
      return /\n[^\S\r\n]/.test(str);
    }
    formatItem(term, termWidth, description, helper) {
      const itemIndent = 2;
      const itemIndentStr = " ".repeat(itemIndent);
      if (!description)
        return itemIndentStr + term;
      const paddedTerm = term.padEnd(termWidth + term.length - helper.displayWidth(term));
      const spacerWidth = 2;
      const helpWidth = this.helpWidth ?? 80;
      const remainingWidth = helpWidth - termWidth - spacerWidth - itemIndent;
      let formattedDescription;
      if (remainingWidth < this.minWidthToWrap || helper.preformatted(description)) {
        formattedDescription = description;
      } else {
        const wrappedDescription = helper.boxWrap(description, remainingWidth);
        formattedDescription = wrappedDescription.replace(/\n/g, `
` + " ".repeat(termWidth + spacerWidth));
      }
      return itemIndentStr + paddedTerm + " ".repeat(spacerWidth) + formattedDescription.replace(/\n/g, `
${itemIndentStr}`);
    }
    boxWrap(str, width) {
      if (width < this.minWidthToWrap)
        return str;
      const rawLines = str.split(/\r\n|\n/);
      const chunkPattern = /[\s]*[^\s]+/g;
      const wrappedLines = [];
      rawLines.forEach((line) => {
        const chunks = line.match(chunkPattern);
        if (chunks === null) {
          wrappedLines.push("");
          return;
        }
        let sumChunks = [chunks.shift()];
        let sumWidth = this.displayWidth(sumChunks[0]);
        chunks.forEach((chunk) => {
          const visibleWidth = this.displayWidth(chunk);
          if (sumWidth + visibleWidth <= width) {
            sumChunks.push(chunk);
            sumWidth += visibleWidth;
            return;
          }
          wrappedLines.push(sumChunks.join(""));
          const nextChunk = chunk.trimStart();
          sumChunks = [nextChunk];
          sumWidth = this.displayWidth(nextChunk);
        });
        wrappedLines.push(sumChunks.join(""));
      });
      return wrappedLines.join(`
`);
    }
  }
  function stripColor(str) {
    const sgrPattern = /\x1b\[\d*(;\d*)*m/g;
    return str.replace(sgrPattern, "");
  }
  exports.Help = Help;
  exports.stripColor = stripColor;
});

// node_modules/commander/lib/option.js
var require_option = __commonJS((exports) => {
  var { InvalidArgumentError } = require_error();

  class Option {
    constructor(flags, description) {
      this.flags = flags;
      this.description = description || "";
      this.required = flags.includes("<");
      this.optional = flags.includes("[");
      this.variadic = /\w\.\.\.[>\]]$/.test(flags);
      this.mandatory = false;
      const optionFlags = splitOptionFlags(flags);
      this.short = optionFlags.shortFlag;
      this.long = optionFlags.longFlag;
      this.negate = false;
      if (this.long) {
        this.negate = this.long.startsWith("--no-");
      }
      this.defaultValue = undefined;
      this.defaultValueDescription = undefined;
      this.presetArg = undefined;
      this.envVar = undefined;
      this.parseArg = undefined;
      this.hidden = false;
      this.argChoices = undefined;
      this.conflictsWith = [];
      this.implied = undefined;
    }
    default(value, description) {
      this.defaultValue = value;
      this.defaultValueDescription = description;
      return this;
    }
    preset(arg) {
      this.presetArg = arg;
      return this;
    }
    conflicts(names) {
      this.conflictsWith = this.conflictsWith.concat(names);
      return this;
    }
    implies(impliedOptionValues) {
      let newImplied = impliedOptionValues;
      if (typeof impliedOptionValues === "string") {
        newImplied = { [impliedOptionValues]: true };
      }
      this.implied = Object.assign(this.implied || {}, newImplied);
      return this;
    }
    env(name) {
      this.envVar = name;
      return this;
    }
    argParser(fn) {
      this.parseArg = fn;
      return this;
    }
    makeOptionMandatory(mandatory = true) {
      this.mandatory = !!mandatory;
      return this;
    }
    hideHelp(hide = true) {
      this.hidden = !!hide;
      return this;
    }
    _concatValue(value, previous) {
      if (previous === this.defaultValue || !Array.isArray(previous)) {
        return [value];
      }
      return previous.concat(value);
    }
    choices(values) {
      this.argChoices = values.slice();
      this.parseArg = (arg, previous) => {
        if (!this.argChoices.includes(arg)) {
          throw new InvalidArgumentError(`Allowed choices are ${this.argChoices.join(", ")}.`);
        }
        if (this.variadic) {
          return this._concatValue(arg, previous);
        }
        return arg;
      };
      return this;
    }
    name() {
      if (this.long) {
        return this.long.replace(/^--/, "");
      }
      return this.short.replace(/^-/, "");
    }
    attributeName() {
      if (this.negate) {
        return camelcase(this.name().replace(/^no-/, ""));
      }
      return camelcase(this.name());
    }
    is(arg) {
      return this.short === arg || this.long === arg;
    }
    isBoolean() {
      return !this.required && !this.optional && !this.negate;
    }
  }

  class DualOptions {
    constructor(options) {
      this.positiveOptions = new Map;
      this.negativeOptions = new Map;
      this.dualOptions = new Set;
      options.forEach((option) => {
        if (option.negate) {
          this.negativeOptions.set(option.attributeName(), option);
        } else {
          this.positiveOptions.set(option.attributeName(), option);
        }
      });
      this.negativeOptions.forEach((value, key) => {
        if (this.positiveOptions.has(key)) {
          this.dualOptions.add(key);
        }
      });
    }
    valueFromOption(value, option) {
      const optionKey = option.attributeName();
      if (!this.dualOptions.has(optionKey))
        return true;
      const preset = this.negativeOptions.get(optionKey).presetArg;
      const negativeValue = preset !== undefined ? preset : false;
      return option.negate === (negativeValue === value);
    }
  }
  function camelcase(str) {
    return str.split("-").reduce((str2, word) => {
      return str2 + word[0].toUpperCase() + word.slice(1);
    });
  }
  function splitOptionFlags(flags) {
    let shortFlag;
    let longFlag;
    const shortFlagExp = /^-[^-]$/;
    const longFlagExp = /^--[^-]/;
    const flagParts = flags.split(/[ |,]+/).concat("guard");
    if (shortFlagExp.test(flagParts[0]))
      shortFlag = flagParts.shift();
    if (longFlagExp.test(flagParts[0]))
      longFlag = flagParts.shift();
    if (!shortFlag && shortFlagExp.test(flagParts[0]))
      shortFlag = flagParts.shift();
    if (!shortFlag && longFlagExp.test(flagParts[0])) {
      shortFlag = longFlag;
      longFlag = flagParts.shift();
    }
    if (flagParts[0].startsWith("-")) {
      const unsupportedFlag = flagParts[0];
      const baseError = `option creation failed due to '${unsupportedFlag}' in option flags '${flags}'`;
      if (/^-[^-][^-]/.test(unsupportedFlag))
        throw new Error(`${baseError}
- a short flag is a single dash and a single character
  - either use a single dash and a single character (for a short flag)
  - or use a double dash for a long option (and can have two, like '--ws, --workspace')`);
      if (shortFlagExp.test(unsupportedFlag))
        throw new Error(`${baseError}
- too many short flags`);
      if (longFlagExp.test(unsupportedFlag))
        throw new Error(`${baseError}
- too many long flags`);
      throw new Error(`${baseError}
- unrecognised flag format`);
    }
    if (shortFlag === undefined && longFlag === undefined)
      throw new Error(`option creation failed due to no flags found in '${flags}'.`);
    return { shortFlag, longFlag };
  }
  exports.Option = Option;
  exports.DualOptions = DualOptions;
});

// node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS((exports) => {
  var maxDistance = 3;
  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > maxDistance)
      return Math.max(a.length, b.length);
    const d = [];
    for (let i = 0;i <= a.length; i++) {
      d[i] = [i];
    }
    for (let j = 0;j <= b.length; j++) {
      d[0][j] = j;
    }
    for (let j = 1;j <= b.length; j++) {
      for (let i = 1;i <= a.length; i++) {
        let cost = 1;
        if (a[i - 1] === b[j - 1]) {
          cost = 0;
        } else {
          cost = 1;
        }
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[a.length][b.length];
  }
  function suggestSimilar(word, candidates) {
    if (!candidates || candidates.length === 0)
      return "";
    candidates = Array.from(new Set(candidates));
    const searchingOptions = word.startsWith("--");
    if (searchingOptions) {
      word = word.slice(2);
      candidates = candidates.map((candidate) => candidate.slice(2));
    }
    let similar = [];
    let bestDistance = maxDistance;
    const minSimilarity = 0.4;
    candidates.forEach((candidate) => {
      if (candidate.length <= 1)
        return;
      const distance = editDistance(word, candidate);
      const length = Math.max(word.length, candidate.length);
      const similarity = (length - distance) / length;
      if (similarity > minSimilarity) {
        if (distance < bestDistance) {
          bestDistance = distance;
          similar = [candidate];
        } else if (distance === bestDistance) {
          similar.push(candidate);
        }
      }
    });
    similar.sort((a, b) => a.localeCompare(b));
    if (searchingOptions) {
      similar = similar.map((candidate) => `--${candidate}`);
    }
    if (similar.length > 1) {
      return `
(Did you mean one of ${similar.join(", ")}?)`;
    }
    if (similar.length === 1) {
      return `
(Did you mean ${similar[0]}?)`;
    }
    return "";
  }
  exports.suggestSimilar = suggestSimilar;
});

// node_modules/commander/lib/command.js
var require_command = __commonJS((exports) => {
  var EventEmitter = __require("events").EventEmitter;
  var childProcess = __require("child_process");
  var path = __require("path");
  var fs = __require("fs");
  var process2 = __require("process");
  var { Argument, humanReadableArgName } = require_argument();
  var { CommanderError } = require_error();
  var { Help, stripColor } = require_help();
  var { Option, DualOptions } = require_option();
  var { suggestSimilar } = require_suggestSimilar();

  class Command extends EventEmitter {
    constructor(name) {
      super();
      this.commands = [];
      this.options = [];
      this.parent = null;
      this._allowUnknownOption = false;
      this._allowExcessArguments = false;
      this.registeredArguments = [];
      this._args = this.registeredArguments;
      this.args = [];
      this.rawArgs = [];
      this.processedArgs = [];
      this._scriptPath = null;
      this._name = name || "";
      this._optionValues = {};
      this._optionValueSources = {};
      this._storeOptionsAsProperties = false;
      this._actionHandler = null;
      this._executableHandler = false;
      this._executableFile = null;
      this._executableDir = null;
      this._defaultCommandName = null;
      this._exitCallback = null;
      this._aliases = [];
      this._combineFlagAndOptionalValue = true;
      this._description = "";
      this._summary = "";
      this._argsDescription = undefined;
      this._enablePositionalOptions = false;
      this._passThroughOptions = false;
      this._lifeCycleHooks = {};
      this._showHelpAfterError = false;
      this._showSuggestionAfterError = true;
      this._savedState = null;
      this._outputConfiguration = {
        writeOut: (str) => process2.stdout.write(str),
        writeErr: (str) => process2.stderr.write(str),
        outputError: (str, write) => write(str),
        getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : undefined,
        getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : undefined,
        getOutHasColors: () => useColor() ?? (process2.stdout.isTTY && process2.stdout.hasColors?.()),
        getErrHasColors: () => useColor() ?? (process2.stderr.isTTY && process2.stderr.hasColors?.()),
        stripColor: (str) => stripColor(str)
      };
      this._hidden = false;
      this._helpOption = undefined;
      this._addImplicitHelpCommand = undefined;
      this._helpCommand = undefined;
      this._helpConfiguration = {};
    }
    copyInheritedSettings(sourceCommand) {
      this._outputConfiguration = sourceCommand._outputConfiguration;
      this._helpOption = sourceCommand._helpOption;
      this._helpCommand = sourceCommand._helpCommand;
      this._helpConfiguration = sourceCommand._helpConfiguration;
      this._exitCallback = sourceCommand._exitCallback;
      this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
      this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
      this._allowExcessArguments = sourceCommand._allowExcessArguments;
      this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
      this._showHelpAfterError = sourceCommand._showHelpAfterError;
      this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
      return this;
    }
    _getCommandAndAncestors() {
      const result = [];
      for (let command = this;command; command = command.parent) {
        result.push(command);
      }
      return result;
    }
    command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
      let desc = actionOptsOrExecDesc;
      let opts = execOpts;
      if (typeof desc === "object" && desc !== null) {
        opts = desc;
        desc = null;
      }
      opts = opts || {};
      const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
      const cmd = this.createCommand(name);
      if (desc) {
        cmd.description(desc);
        cmd._executableHandler = true;
      }
      if (opts.isDefault)
        this._defaultCommandName = cmd._name;
      cmd._hidden = !!(opts.noHelp || opts.hidden);
      cmd._executableFile = opts.executableFile || null;
      if (args)
        cmd.arguments(args);
      this._registerCommand(cmd);
      cmd.parent = this;
      cmd.copyInheritedSettings(this);
      if (desc)
        return this;
      return cmd;
    }
    createCommand(name) {
      return new Command(name);
    }
    createHelp() {
      return Object.assign(new Help, this.configureHelp());
    }
    configureHelp(configuration) {
      if (configuration === undefined)
        return this._helpConfiguration;
      this._helpConfiguration = configuration;
      return this;
    }
    configureOutput(configuration) {
      if (configuration === undefined)
        return this._outputConfiguration;
      Object.assign(this._outputConfiguration, configuration);
      return this;
    }
    showHelpAfterError(displayHelp = true) {
      if (typeof displayHelp !== "string")
        displayHelp = !!displayHelp;
      this._showHelpAfterError = displayHelp;
      return this;
    }
    showSuggestionAfterError(displaySuggestion = true) {
      this._showSuggestionAfterError = !!displaySuggestion;
      return this;
    }
    addCommand(cmd, opts) {
      if (!cmd._name) {
        throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
      }
      opts = opts || {};
      if (opts.isDefault)
        this._defaultCommandName = cmd._name;
      if (opts.noHelp || opts.hidden)
        cmd._hidden = true;
      this._registerCommand(cmd);
      cmd.parent = this;
      cmd._checkForBrokenPassThrough();
      return this;
    }
    createArgument(name, description) {
      return new Argument(name, description);
    }
    argument(name, description, fn, defaultValue) {
      const argument = this.createArgument(name, description);
      if (typeof fn === "function") {
        argument.default(defaultValue).argParser(fn);
      } else {
        argument.default(fn);
      }
      this.addArgument(argument);
      return this;
    }
    arguments(names) {
      names.trim().split(/ +/).forEach((detail) => {
        this.argument(detail);
      });
      return this;
    }
    addArgument(argument) {
      const previousArgument = this.registeredArguments.slice(-1)[0];
      if (previousArgument && previousArgument.variadic) {
        throw new Error(`only the last argument can be variadic '${previousArgument.name()}'`);
      }
      if (argument.required && argument.defaultValue !== undefined && argument.parseArg === undefined) {
        throw new Error(`a default value for a required argument is never used: '${argument.name()}'`);
      }
      this.registeredArguments.push(argument);
      return this;
    }
    helpCommand(enableOrNameAndArgs, description) {
      if (typeof enableOrNameAndArgs === "boolean") {
        this._addImplicitHelpCommand = enableOrNameAndArgs;
        return this;
      }
      enableOrNameAndArgs = enableOrNameAndArgs ?? "help [command]";
      const [, helpName, helpArgs] = enableOrNameAndArgs.match(/([^ ]+) *(.*)/);
      const helpDescription = description ?? "display help for command";
      const helpCommand = this.createCommand(helpName);
      helpCommand.helpOption(false);
      if (helpArgs)
        helpCommand.arguments(helpArgs);
      if (helpDescription)
        helpCommand.description(helpDescription);
      this._addImplicitHelpCommand = true;
      this._helpCommand = helpCommand;
      return this;
    }
    addHelpCommand(helpCommand, deprecatedDescription) {
      if (typeof helpCommand !== "object") {
        this.helpCommand(helpCommand, deprecatedDescription);
        return this;
      }
      this._addImplicitHelpCommand = true;
      this._helpCommand = helpCommand;
      return this;
    }
    _getHelpCommand() {
      const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
      if (hasImplicitHelpCommand) {
        if (this._helpCommand === undefined) {
          this.helpCommand(undefined, undefined);
        }
        return this._helpCommand;
      }
      return null;
    }
    hook(event, listener) {
      const allowedValues = ["preSubcommand", "preAction", "postAction"];
      if (!allowedValues.includes(event)) {
        throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
      }
      if (this._lifeCycleHooks[event]) {
        this._lifeCycleHooks[event].push(listener);
      } else {
        this._lifeCycleHooks[event] = [listener];
      }
      return this;
    }
    exitOverride(fn) {
      if (fn) {
        this._exitCallback = fn;
      } else {
        this._exitCallback = (err) => {
          if (err.code !== "commander.executeSubCommandAsync") {
            throw err;
          } else {}
        };
      }
      return this;
    }
    _exit(exitCode, code, message) {
      if (this._exitCallback) {
        this._exitCallback(new CommanderError(exitCode, code, message));
      }
      process2.exit(exitCode);
    }
    action(fn) {
      const listener = (args) => {
        const expectedArgsCount = this.registeredArguments.length;
        const actionArgs = args.slice(0, expectedArgsCount);
        if (this._storeOptionsAsProperties) {
          actionArgs[expectedArgsCount] = this;
        } else {
          actionArgs[expectedArgsCount] = this.opts();
        }
        actionArgs.push(this);
        return fn.apply(this, actionArgs);
      };
      this._actionHandler = listener;
      return this;
    }
    createOption(flags, description) {
      return new Option(flags, description);
    }
    _callParseArg(target, value, previous, invalidArgumentMessage) {
      try {
        return target.parseArg(value, previous);
      } catch (err) {
        if (err.code === "commander.invalidArgument") {
          const message = `${invalidArgumentMessage} ${err.message}`;
          this.error(message, { exitCode: err.exitCode, code: err.code });
        }
        throw err;
      }
    }
    _registerOption(option) {
      const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
      if (matchingOption) {
        const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
        throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
      }
      this.options.push(option);
    }
    _registerCommand(command) {
      const knownBy = (cmd) => {
        return [cmd.name()].concat(cmd.aliases());
      };
      const alreadyUsed = knownBy(command).find((name) => this._findCommand(name));
      if (alreadyUsed) {
        const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
        const newCmd = knownBy(command).join("|");
        throw new Error(`cannot add command '${newCmd}' as already have command '${existingCmd}'`);
      }
      this.commands.push(command);
    }
    addOption(option) {
      this._registerOption(option);
      const oname = option.name();
      const name = option.attributeName();
      if (option.negate) {
        const positiveLongFlag = option.long.replace(/^--no-/, "--");
        if (!this._findOption(positiveLongFlag)) {
          this.setOptionValueWithSource(name, option.defaultValue === undefined ? true : option.defaultValue, "default");
        }
      } else if (option.defaultValue !== undefined) {
        this.setOptionValueWithSource(name, option.defaultValue, "default");
      }
      const handleOptionValue = (val, invalidValueMessage, valueSource) => {
        if (val == null && option.presetArg !== undefined) {
          val = option.presetArg;
        }
        const oldValue = this.getOptionValue(name);
        if (val !== null && option.parseArg) {
          val = this._callParseArg(option, val, oldValue, invalidValueMessage);
        } else if (val !== null && option.variadic) {
          val = option._concatValue(val, oldValue);
        }
        if (val == null) {
          if (option.negate) {
            val = false;
          } else if (option.isBoolean() || option.optional) {
            val = true;
          } else {
            val = "";
          }
        }
        this.setOptionValueWithSource(name, val, valueSource);
      };
      this.on("option:" + oname, (val) => {
        const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
        handleOptionValue(val, invalidValueMessage, "cli");
      });
      if (option.envVar) {
        this.on("optionEnv:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "env");
        });
      }
      return this;
    }
    _optionEx(config, flags, description, fn, defaultValue) {
      if (typeof flags === "object" && flags instanceof Option) {
        throw new Error("To add an Option object use addOption() instead of option() or requiredOption()");
      }
      const option = this.createOption(flags, description);
      option.makeOptionMandatory(!!config.mandatory);
      if (typeof fn === "function") {
        option.default(defaultValue).argParser(fn);
      } else if (fn instanceof RegExp) {
        const regex = fn;
        fn = (val, def) => {
          const m = regex.exec(val);
          return m ? m[0] : def;
        };
        option.default(defaultValue).argParser(fn);
      } else {
        option.default(fn);
      }
      return this.addOption(option);
    }
    option(flags, description, parseArg, defaultValue) {
      return this._optionEx({}, flags, description, parseArg, defaultValue);
    }
    requiredOption(flags, description, parseArg, defaultValue) {
      return this._optionEx({ mandatory: true }, flags, description, parseArg, defaultValue);
    }
    combineFlagAndOptionalValue(combine = true) {
      this._combineFlagAndOptionalValue = !!combine;
      return this;
    }
    allowUnknownOption(allowUnknown = true) {
      this._allowUnknownOption = !!allowUnknown;
      return this;
    }
    allowExcessArguments(allowExcess = true) {
      this._allowExcessArguments = !!allowExcess;
      return this;
    }
    enablePositionalOptions(positional = true) {
      this._enablePositionalOptions = !!positional;
      return this;
    }
    passThroughOptions(passThrough = true) {
      this._passThroughOptions = !!passThrough;
      this._checkForBrokenPassThrough();
      return this;
    }
    _checkForBrokenPassThrough() {
      if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
        throw new Error(`passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`);
      }
    }
    storeOptionsAsProperties(storeAsProperties = true) {
      if (this.options.length) {
        throw new Error("call .storeOptionsAsProperties() before adding options");
      }
      if (Object.keys(this._optionValues).length) {
        throw new Error("call .storeOptionsAsProperties() before setting option values");
      }
      this._storeOptionsAsProperties = !!storeAsProperties;
      return this;
    }
    getOptionValue(key) {
      if (this._storeOptionsAsProperties) {
        return this[key];
      }
      return this._optionValues[key];
    }
    setOptionValue(key, value) {
      return this.setOptionValueWithSource(key, value, undefined);
    }
    setOptionValueWithSource(key, value, source) {
      if (this._storeOptionsAsProperties) {
        this[key] = value;
      } else {
        this._optionValues[key] = value;
      }
      this._optionValueSources[key] = source;
      return this;
    }
    getOptionValueSource(key) {
      return this._optionValueSources[key];
    }
    getOptionValueSourceWithGlobals(key) {
      let source;
      this._getCommandAndAncestors().forEach((cmd) => {
        if (cmd.getOptionValueSource(key) !== undefined) {
          source = cmd.getOptionValueSource(key);
        }
      });
      return source;
    }
    _prepareUserArgs(argv, parseOptions) {
      if (argv !== undefined && !Array.isArray(argv)) {
        throw new Error("first parameter to parse must be array or undefined");
      }
      parseOptions = parseOptions || {};
      if (argv === undefined && parseOptions.from === undefined) {
        if (process2.versions?.electron) {
          parseOptions.from = "electron";
        }
        const execArgv = process2.execArgv ?? [];
        if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
          parseOptions.from = "eval";
        }
      }
      if (argv === undefined) {
        argv = process2.argv;
      }
      this.rawArgs = argv.slice();
      let userArgs;
      switch (parseOptions.from) {
        case undefined:
        case "node":
          this._scriptPath = argv[1];
          userArgs = argv.slice(2);
          break;
        case "electron":
          if (process2.defaultApp) {
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
          } else {
            userArgs = argv.slice(1);
          }
          break;
        case "user":
          userArgs = argv.slice(0);
          break;
        case "eval":
          userArgs = argv.slice(1);
          break;
        default:
          throw new Error(`unexpected parse option { from: '${parseOptions.from}' }`);
      }
      if (!this._name && this._scriptPath)
        this.nameFromFilename(this._scriptPath);
      this._name = this._name || "program";
      return userArgs;
    }
    parse(argv, parseOptions) {
      this._prepareForParse();
      const userArgs = this._prepareUserArgs(argv, parseOptions);
      this._parseCommand([], userArgs);
      return this;
    }
    async parseAsync(argv, parseOptions) {
      this._prepareForParse();
      const userArgs = this._prepareUserArgs(argv, parseOptions);
      await this._parseCommand([], userArgs);
      return this;
    }
    _prepareForParse() {
      if (this._savedState === null) {
        this.saveStateBeforeParse();
      } else {
        this.restoreStateBeforeParse();
      }
    }
    saveStateBeforeParse() {
      this._savedState = {
        _name: this._name,
        _optionValues: { ...this._optionValues },
        _optionValueSources: { ...this._optionValueSources }
      };
    }
    restoreStateBeforeParse() {
      if (this._storeOptionsAsProperties)
        throw new Error(`Can not call parse again when storeOptionsAsProperties is true.
- either make a new Command for each call to parse, or stop storing options as properties`);
      this._name = this._savedState._name;
      this._scriptPath = null;
      this.rawArgs = [];
      this._optionValues = { ...this._savedState._optionValues };
      this._optionValueSources = { ...this._savedState._optionValueSources };
      this.args = [];
      this.processedArgs = [];
    }
    _checkForMissingExecutable(executableFile, executableDir, subcommandName) {
      if (fs.existsSync(executableFile))
        return;
      const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
      const executableMissing = `'${executableFile}' does not exist
 - if '${subcommandName}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
      throw new Error(executableMissing);
    }
    _executeSubCommand(subcommand, args) {
      args = args.slice();
      let launchWithNode = false;
      const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
      function findFile(baseDir, baseName) {
        const localBin = path.resolve(baseDir, baseName);
        if (fs.existsSync(localBin))
          return localBin;
        if (sourceExt.includes(path.extname(baseName)))
          return;
        const foundExt = sourceExt.find((ext) => fs.existsSync(`${localBin}${ext}`));
        if (foundExt)
          return `${localBin}${foundExt}`;
        return;
      }
      this._checkForMissingMandatoryOptions();
      this._checkForConflictingOptions();
      let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
      let executableDir = this._executableDir || "";
      if (this._scriptPath) {
        let resolvedScriptPath;
        try {
          resolvedScriptPath = fs.realpathSync(this._scriptPath);
        } catch {
          resolvedScriptPath = this._scriptPath;
        }
        executableDir = path.resolve(path.dirname(resolvedScriptPath), executableDir);
      }
      if (executableDir) {
        let localFile = findFile(executableDir, executableFile);
        if (!localFile && !subcommand._executableFile && this._scriptPath) {
          const legacyName = path.basename(this._scriptPath, path.extname(this._scriptPath));
          if (legacyName !== this._name) {
            localFile = findFile(executableDir, `${legacyName}-${subcommand._name}`);
          }
        }
        executableFile = localFile || executableFile;
      }
      launchWithNode = sourceExt.includes(path.extname(executableFile));
      let proc;
      if (process2.platform !== "win32") {
        if (launchWithNode) {
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
        } else {
          proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
        }
      } else {
        this._checkForMissingExecutable(executableFile, executableDir, subcommand._name);
        args.unshift(executableFile);
        args = incrementNodeInspectorPort(process2.execArgv).concat(args);
        proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
      }
      if (!proc.killed) {
        const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
        signals.forEach((signal) => {
          process2.on(signal, () => {
            if (proc.killed === false && proc.exitCode === null) {
              proc.kill(signal);
            }
          });
        });
      }
      const exitCallback = this._exitCallback;
      proc.on("close", (code) => {
        code = code ?? 1;
        if (!exitCallback) {
          process2.exit(code);
        } else {
          exitCallback(new CommanderError(code, "commander.executeSubCommandAsync", "(close)"));
        }
      });
      proc.on("error", (err) => {
        if (err.code === "ENOENT") {
          this._checkForMissingExecutable(executableFile, executableDir, subcommand._name);
        } else if (err.code === "EACCES") {
          throw new Error(`'${executableFile}' not executable`);
        }
        if (!exitCallback) {
          process2.exit(1);
        } else {
          const wrappedError = new CommanderError(1, "commander.executeSubCommandAsync", "(error)");
          wrappedError.nestedError = err;
          exitCallback(wrappedError);
        }
      });
      this.runningCommand = proc;
    }
    _dispatchSubcommand(commandName, operands, unknown) {
      const subCommand = this._findCommand(commandName);
      if (!subCommand)
        this.help({ error: true });
      subCommand._prepareForParse();
      let promiseChain;
      promiseChain = this._chainOrCallSubCommandHook(promiseChain, subCommand, "preSubcommand");
      promiseChain = this._chainOrCall(promiseChain, () => {
        if (subCommand._executableHandler) {
          this._executeSubCommand(subCommand, operands.concat(unknown));
        } else {
          return subCommand._parseCommand(operands, unknown);
        }
      });
      return promiseChain;
    }
    _dispatchHelpCommand(subcommandName) {
      if (!subcommandName) {
        this.help();
      }
      const subCommand = this._findCommand(subcommandName);
      if (subCommand && !subCommand._executableHandler) {
        subCommand.help();
      }
      return this._dispatchSubcommand(subcommandName, [], [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]);
    }
    _checkNumberOfArguments() {
      this.registeredArguments.forEach((arg, i) => {
        if (arg.required && this.args[i] == null) {
          this.missingArgument(arg.name());
        }
      });
      if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
        return;
      }
      if (this.args.length > this.registeredArguments.length) {
        this._excessArguments(this.args);
      }
    }
    _processArguments() {
      const myParseArg = (argument, value, previous) => {
        let parsedValue = value;
        if (value !== null && argument.parseArg) {
          const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
          parsedValue = this._callParseArg(argument, value, previous, invalidValueMessage);
        }
        return parsedValue;
      };
      this._checkNumberOfArguments();
      const processedArgs = [];
      this.registeredArguments.forEach((declaredArg, index) => {
        let value = declaredArg.defaultValue;
        if (declaredArg.variadic) {
          if (index < this.args.length) {
            value = this.args.slice(index);
            if (declaredArg.parseArg) {
              value = value.reduce((processed, v) => {
                return myParseArg(declaredArg, v, processed);
              }, declaredArg.defaultValue);
            }
          } else if (value === undefined) {
            value = [];
          }
        } else if (index < this.args.length) {
          value = this.args[index];
          if (declaredArg.parseArg) {
            value = myParseArg(declaredArg, value, declaredArg.defaultValue);
          }
        }
        processedArgs[index] = value;
      });
      this.processedArgs = processedArgs;
    }
    _chainOrCall(promise, fn) {
      if (promise && promise.then && typeof promise.then === "function") {
        return promise.then(() => fn());
      }
      return fn();
    }
    _chainOrCallHooks(promise, event) {
      let result = promise;
      const hooks = [];
      this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== undefined).forEach((hookedCommand) => {
        hookedCommand._lifeCycleHooks[event].forEach((callback) => {
          hooks.push({ hookedCommand, callback });
        });
      });
      if (event === "postAction") {
        hooks.reverse();
      }
      hooks.forEach((hookDetail) => {
        result = this._chainOrCall(result, () => {
          return hookDetail.callback(hookDetail.hookedCommand, this);
        });
      });
      return result;
    }
    _chainOrCallSubCommandHook(promise, subCommand, event) {
      let result = promise;
      if (this._lifeCycleHooks[event] !== undefined) {
        this._lifeCycleHooks[event].forEach((hook) => {
          result = this._chainOrCall(result, () => {
            return hook(this, subCommand);
          });
        });
      }
      return result;
    }
    _parseCommand(operands, unknown) {
      const parsed = this.parseOptions(unknown);
      this._parseOptionsEnv();
      this._parseOptionsImplied();
      operands = operands.concat(parsed.operands);
      unknown = parsed.unknown;
      this.args = operands.concat(unknown);
      if (operands && this._findCommand(operands[0])) {
        return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
      }
      if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
        return this._dispatchHelpCommand(operands[1]);
      }
      if (this._defaultCommandName) {
        this._outputHelpIfRequested(unknown);
        return this._dispatchSubcommand(this._defaultCommandName, operands, unknown);
      }
      if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
        this.help({ error: true });
      }
      this._outputHelpIfRequested(parsed.unknown);
      this._checkForMissingMandatoryOptions();
      this._checkForConflictingOptions();
      const checkForUnknownOptions = () => {
        if (parsed.unknown.length > 0) {
          this.unknownOption(parsed.unknown[0]);
        }
      };
      const commandEvent = `command:${this.name()}`;
      if (this._actionHandler) {
        checkForUnknownOptions();
        this._processArguments();
        let promiseChain;
        promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
        promiseChain = this._chainOrCall(promiseChain, () => this._actionHandler(this.processedArgs));
        if (this.parent) {
          promiseChain = this._chainOrCall(promiseChain, () => {
            this.parent.emit(commandEvent, operands, unknown);
          });
        }
        promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
        return promiseChain;
      }
      if (this.parent && this.parent.listenerCount(commandEvent)) {
        checkForUnknownOptions();
        this._processArguments();
        this.parent.emit(commandEvent, operands, unknown);
      } else if (operands.length) {
        if (this._findCommand("*")) {
          return this._dispatchSubcommand("*", operands, unknown);
        }
        if (this.listenerCount("command:*")) {
          this.emit("command:*", operands, unknown);
        } else if (this.commands.length) {
          this.unknownCommand();
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      } else if (this.commands.length) {
        checkForUnknownOptions();
        this.help({ error: true });
      } else {
        checkForUnknownOptions();
        this._processArguments();
      }
    }
    _findCommand(name) {
      if (!name)
        return;
      return this.commands.find((cmd) => cmd._name === name || cmd._aliases.includes(name));
    }
    _findOption(arg) {
      return this.options.find((option) => option.is(arg));
    }
    _checkForMissingMandatoryOptions() {
      this._getCommandAndAncestors().forEach((cmd) => {
        cmd.options.forEach((anOption) => {
          if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === undefined) {
            cmd.missingMandatoryOptionValue(anOption);
          }
        });
      });
    }
    _checkForConflictingLocalOptions() {
      const definedNonDefaultOptions = this.options.filter((option) => {
        const optionKey = option.attributeName();
        if (this.getOptionValue(optionKey) === undefined) {
          return false;
        }
        return this.getOptionValueSource(optionKey) !== "default";
      });
      const optionsWithConflicting = definedNonDefaultOptions.filter((option) => option.conflictsWith.length > 0);
      optionsWithConflicting.forEach((option) => {
        const conflictingAndDefined = definedNonDefaultOptions.find((defined) => option.conflictsWith.includes(defined.attributeName()));
        if (conflictingAndDefined) {
          this._conflictingOption(option, conflictingAndDefined);
        }
      });
    }
    _checkForConflictingOptions() {
      this._getCommandAndAncestors().forEach((cmd) => {
        cmd._checkForConflictingLocalOptions();
      });
    }
    parseOptions(argv) {
      const operands = [];
      const unknown = [];
      let dest = operands;
      const args = argv.slice();
      function maybeOption(arg) {
        return arg.length > 1 && arg[0] === "-";
      }
      let activeVariadicOption = null;
      while (args.length) {
        const arg = args.shift();
        if (arg === "--") {
          if (dest === unknown)
            dest.push(arg);
          dest.push(...args);
          break;
        }
        if (activeVariadicOption && !maybeOption(arg)) {
          this.emit(`option:${activeVariadicOption.name()}`, arg);
          continue;
        }
        activeVariadicOption = null;
        if (maybeOption(arg)) {
          const option = this._findOption(arg);
          if (option) {
            if (option.required) {
              const value = args.shift();
              if (value === undefined)
                this.optionMissingArgument(option);
              this.emit(`option:${option.name()}`, value);
            } else if (option.optional) {
              let value = null;
              if (args.length > 0 && !maybeOption(args[0])) {
                value = args.shift();
              }
              this.emit(`option:${option.name()}`, value);
            } else {
              this.emit(`option:${option.name()}`);
            }
            activeVariadicOption = option.variadic ? option : null;
            continue;
          }
        }
        if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
          const option = this._findOption(`-${arg[1]}`);
          if (option) {
            if (option.required || option.optional && this._combineFlagAndOptionalValue) {
              this.emit(`option:${option.name()}`, arg.slice(2));
            } else {
              this.emit(`option:${option.name()}`);
              args.unshift(`-${arg.slice(2)}`);
            }
            continue;
          }
        }
        if (/^--[^=]+=/.test(arg)) {
          const index = arg.indexOf("=");
          const option = this._findOption(arg.slice(0, index));
          if (option && (option.required || option.optional)) {
            this.emit(`option:${option.name()}`, arg.slice(index + 1));
            continue;
          }
        }
        if (maybeOption(arg)) {
          dest = unknown;
        }
        if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
          if (this._findCommand(arg)) {
            operands.push(arg);
            if (args.length > 0)
              unknown.push(...args);
            break;
          } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
            operands.push(arg);
            if (args.length > 0)
              operands.push(...args);
            break;
          } else if (this._defaultCommandName) {
            unknown.push(arg);
            if (args.length > 0)
              unknown.push(...args);
            break;
          }
        }
        if (this._passThroughOptions) {
          dest.push(arg);
          if (args.length > 0)
            dest.push(...args);
          break;
        }
        dest.push(arg);
      }
      return { operands, unknown };
    }
    opts() {
      if (this._storeOptionsAsProperties) {
        const result = {};
        const len = this.options.length;
        for (let i = 0;i < len; i++) {
          const key = this.options[i].attributeName();
          result[key] = key === this._versionOptionName ? this._version : this[key];
        }
        return result;
      }
      return this._optionValues;
    }
    optsWithGlobals() {
      return this._getCommandAndAncestors().reduce((combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()), {});
    }
    error(message, errorOptions) {
      this._outputConfiguration.outputError(`${message}
`, this._outputConfiguration.writeErr);
      if (typeof this._showHelpAfterError === "string") {
        this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
      } else if (this._showHelpAfterError) {
        this._outputConfiguration.writeErr(`
`);
        this.outputHelp({ error: true });
      }
      const config = errorOptions || {};
      const exitCode = config.exitCode || 1;
      const code = config.code || "commander.error";
      this._exit(exitCode, code, message);
    }
    _parseOptionsEnv() {
      this.options.forEach((option) => {
        if (option.envVar && option.envVar in process2.env) {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === undefined || ["default", "config", "env"].includes(this.getOptionValueSource(optionKey))) {
            if (option.required || option.optional) {
              this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
            } else {
              this.emit(`optionEnv:${option.name()}`);
            }
          }
        }
      });
    }
    _parseOptionsImplied() {
      const dualHelper = new DualOptions(this.options);
      const hasCustomOptionValue = (optionKey) => {
        return this.getOptionValue(optionKey) !== undefined && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
      };
      this.options.filter((option) => option.implied !== undefined && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(this.getOptionValue(option.attributeName()), option)).forEach((option) => {
        Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
          this.setOptionValueWithSource(impliedKey, option.implied[impliedKey], "implied");
        });
      });
    }
    missingArgument(name) {
      const message = `error: missing required argument '${name}'`;
      this.error(message, { code: "commander.missingArgument" });
    }
    optionMissingArgument(option) {
      const message = `error: option '${option.flags}' argument missing`;
      this.error(message, { code: "commander.optionMissingArgument" });
    }
    missingMandatoryOptionValue(option) {
      const message = `error: required option '${option.flags}' not specified`;
      this.error(message, { code: "commander.missingMandatoryOptionValue" });
    }
    _conflictingOption(option, conflictingOption) {
      const findBestOptionFromValue = (option2) => {
        const optionKey = option2.attributeName();
        const optionValue = this.getOptionValue(optionKey);
        const negativeOption = this.options.find((target) => target.negate && optionKey === target.attributeName());
        const positiveOption = this.options.find((target) => !target.negate && optionKey === target.attributeName());
        if (negativeOption && (negativeOption.presetArg === undefined && optionValue === false || negativeOption.presetArg !== undefined && optionValue === negativeOption.presetArg)) {
          return negativeOption;
        }
        return positiveOption || option2;
      };
      const getErrorMessage = (option2) => {
        const bestOption = findBestOptionFromValue(option2);
        const optionKey = bestOption.attributeName();
        const source = this.getOptionValueSource(optionKey);
        if (source === "env") {
          return `environment variable '${bestOption.envVar}'`;
        }
        return `option '${bestOption.flags}'`;
      };
      const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
      this.error(message, { code: "commander.conflictingOption" });
    }
    unknownOption(flag) {
      if (this._allowUnknownOption)
        return;
      let suggestion = "";
      if (flag.startsWith("--") && this._showSuggestionAfterError) {
        let candidateFlags = [];
        let command = this;
        do {
          const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
          candidateFlags = candidateFlags.concat(moreFlags);
          command = command.parent;
        } while (command && !command._enablePositionalOptions);
        suggestion = suggestSimilar(flag, candidateFlags);
      }
      const message = `error: unknown option '${flag}'${suggestion}`;
      this.error(message, { code: "commander.unknownOption" });
    }
    _excessArguments(receivedArgs) {
      if (this._allowExcessArguments)
        return;
      const expected = this.registeredArguments.length;
      const s = expected === 1 ? "" : "s";
      const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
      const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
      this.error(message, { code: "commander.excessArguments" });
    }
    unknownCommand() {
      const unknownName = this.args[0];
      let suggestion = "";
      if (this._showSuggestionAfterError) {
        const candidateNames = [];
        this.createHelp().visibleCommands(this).forEach((command) => {
          candidateNames.push(command.name());
          if (command.alias())
            candidateNames.push(command.alias());
        });
        suggestion = suggestSimilar(unknownName, candidateNames);
      }
      const message = `error: unknown command '${unknownName}'${suggestion}`;
      this.error(message, { code: "commander.unknownCommand" });
    }
    version(str, flags, description) {
      if (str === undefined)
        return this._version;
      this._version = str;
      flags = flags || "-V, --version";
      description = description || "output the version number";
      const versionOption = this.createOption(flags, description);
      this._versionOptionName = versionOption.attributeName();
      this._registerOption(versionOption);
      this.on("option:" + versionOption.name(), () => {
        this._outputConfiguration.writeOut(`${str}
`);
        this._exit(0, "commander.version", str);
      });
      return this;
    }
    description(str, argsDescription) {
      if (str === undefined && argsDescription === undefined)
        return this._description;
      this._description = str;
      if (argsDescription) {
        this._argsDescription = argsDescription;
      }
      return this;
    }
    summary(str) {
      if (str === undefined)
        return this._summary;
      this._summary = str;
      return this;
    }
    alias(alias) {
      if (alias === undefined)
        return this._aliases[0];
      let command = this;
      if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
        command = this.commands[this.commands.length - 1];
      }
      if (alias === command._name)
        throw new Error("Command alias can't be the same as its name");
      const matchingCommand = this.parent?._findCommand(alias);
      if (matchingCommand) {
        const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
        throw new Error(`cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`);
      }
      command._aliases.push(alias);
      return this;
    }
    aliases(aliases) {
      if (aliases === undefined)
        return this._aliases;
      aliases.forEach((alias) => this.alias(alias));
      return this;
    }
    usage(str) {
      if (str === undefined) {
        if (this._usage)
          return this._usage;
        const args = this.registeredArguments.map((arg) => {
          return humanReadableArgName(arg);
        });
        return [].concat(this.options.length || this._helpOption !== null ? "[options]" : [], this.commands.length ? "[command]" : [], this.registeredArguments.length ? args : []).join(" ");
      }
      this._usage = str;
      return this;
    }
    name(str) {
      if (str === undefined)
        return this._name;
      this._name = str;
      return this;
    }
    nameFromFilename(filename) {
      this._name = path.basename(filename, path.extname(filename));
      return this;
    }
    executableDir(path2) {
      if (path2 === undefined)
        return this._executableDir;
      this._executableDir = path2;
      return this;
    }
    helpInformation(contextOptions) {
      const helper = this.createHelp();
      const context = this._getOutputContext(contextOptions);
      helper.prepareContext({
        error: context.error,
        helpWidth: context.helpWidth,
        outputHasColors: context.hasColors
      });
      const text = helper.formatHelp(this, helper);
      if (context.hasColors)
        return text;
      return this._outputConfiguration.stripColor(text);
    }
    _getOutputContext(contextOptions) {
      contextOptions = contextOptions || {};
      const error = !!contextOptions.error;
      let baseWrite;
      let hasColors;
      let helpWidth;
      if (error) {
        baseWrite = (str) => this._outputConfiguration.writeErr(str);
        hasColors = this._outputConfiguration.getErrHasColors();
        helpWidth = this._outputConfiguration.getErrHelpWidth();
      } else {
        baseWrite = (str) => this._outputConfiguration.writeOut(str);
        hasColors = this._outputConfiguration.getOutHasColors();
        helpWidth = this._outputConfiguration.getOutHelpWidth();
      }
      const write = (str) => {
        if (!hasColors)
          str = this._outputConfiguration.stripColor(str);
        return baseWrite(str);
      };
      return { error, write, hasColors, helpWidth };
    }
    outputHelp(contextOptions) {
      let deprecatedCallback;
      if (typeof contextOptions === "function") {
        deprecatedCallback = contextOptions;
        contextOptions = undefined;
      }
      const outputContext = this._getOutputContext(contextOptions);
      const eventContext = {
        error: outputContext.error,
        write: outputContext.write,
        command: this
      };
      this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", eventContext));
      this.emit("beforeHelp", eventContext);
      let helpInformation = this.helpInformation({ error: outputContext.error });
      if (deprecatedCallback) {
        helpInformation = deprecatedCallback(helpInformation);
        if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
          throw new Error("outputHelp callback must return a string or a Buffer");
        }
      }
      outputContext.write(helpInformation);
      if (this._getHelpOption()?.long) {
        this.emit(this._getHelpOption().long);
      }
      this.emit("afterHelp", eventContext);
      this._getCommandAndAncestors().forEach((command) => command.emit("afterAllHelp", eventContext));
    }
    helpOption(flags, description) {
      if (typeof flags === "boolean") {
        if (flags) {
          this._helpOption = this._helpOption ?? undefined;
        } else {
          this._helpOption = null;
        }
        return this;
      }
      flags = flags ?? "-h, --help";
      description = description ?? "display help for command";
      this._helpOption = this.createOption(flags, description);
      return this;
    }
    _getHelpOption() {
      if (this._helpOption === undefined) {
        this.helpOption(undefined, undefined);
      }
      return this._helpOption;
    }
    addHelpOption(option) {
      this._helpOption = option;
      return this;
    }
    help(contextOptions) {
      this.outputHelp(contextOptions);
      let exitCode = Number(process2.exitCode ?? 0);
      if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
        exitCode = 1;
      }
      this._exit(exitCode, "commander.help", "(outputHelp)");
    }
    addHelpText(position, text) {
      const allowedValues = ["beforeAll", "before", "after", "afterAll"];
      if (!allowedValues.includes(position)) {
        throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
      }
      const helpEvent = `${position}Help`;
      this.on(helpEvent, (context) => {
        let helpStr;
        if (typeof text === "function") {
          helpStr = text({ error: context.error, command: context.command });
        } else {
          helpStr = text;
        }
        if (helpStr) {
          context.write(`${helpStr}
`);
        }
      });
      return this;
    }
    _outputHelpIfRequested(args) {
      const helpOption = this._getHelpOption();
      const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
      if (helpRequested) {
        this.outputHelp();
        this._exit(0, "commander.helpDisplayed", "(outputHelp)");
      }
    }
  }
  function incrementNodeInspectorPort(args) {
    return args.map((arg) => {
      if (!arg.startsWith("--inspect")) {
        return arg;
      }
      let debugOption;
      let debugHost = "127.0.0.1";
      let debugPort = "9229";
      let match;
      if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
        debugOption = match[1];
      } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
        debugOption = match[1];
        if (/^\d+$/.test(match[3])) {
          debugPort = match[3];
        } else {
          debugHost = match[3];
        }
      } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
        debugOption = match[1];
        debugHost = match[3];
        debugPort = match[4];
      }
      if (debugOption && debugPort !== "0") {
        return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
      }
      return arg;
    });
  }
  function useColor() {
    if (process2.env.NO_COLOR || process2.env.FORCE_COLOR === "0" || process2.env.FORCE_COLOR === "false")
      return false;
    if (process2.env.FORCE_COLOR || process2.env.CLICOLOR_FORCE !== undefined)
      return true;
    return;
  }
  exports.Command = Command;
  exports.useColor = useColor;
});

// node_modules/commander/index.js
var require_commander = __commonJS((exports) => {
  var { Argument } = require_argument();
  var { Command } = require_command();
  var { CommanderError, InvalidArgumentError } = require_error();
  var { Help } = require_help();
  var { Option } = require_option();
  exports.program = new Command;
  exports.createCommand = (name) => new Command(name);
  exports.createOption = (flags, description) => new Option(flags, description);
  exports.createArgument = (name, description) => new Argument(name, description);
  exports.Command = Command;
  exports.Option = Option;
  exports.Argument = Argument;
  exports.Help = Help;
  exports.CommanderError = CommanderError;
  exports.InvalidArgumentError = InvalidArgumentError;
  exports.InvalidOptionArgumentError = InvalidArgumentError;
});

// src/paths.ts
import { homedir, platform } from "os";
import { join } from "path";
function currentPlatform() {
  const p = platform();
  if (p === "win32" || p === "darwin" || p === "linux")
    return p;
  return "linux";
}
function getAntigravityDataDir() {
  return join(homedir(), ".gemini", "antigravity");
}
function getConversationsDir() {
  return join(getAntigravityDataDir(), "conversations");
}
function getBrainDir() {
  return join(getAntigravityDataDir(), "brain");
}
function getAnnotationsDir() {
  return join(getAntigravityDataDir(), "annotations");
}
function getElectronUserDataDir() {
  const p = currentPlatform();
  switch (p) {
    case "win32":
      return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Antigravity", "User");
    case "darwin":
      return join(homedir(), "Library", "Application Support", "Antigravity", "User");
    case "linux":
      return join(homedir(), ".config", "Antigravity", "User");
  }
}
function getStorageJsonPath() {
  return join(getElectronUserDataDir(), "globalStorage", "storage.json");
}
function getGlobalStateDbPath() {
  return join(getElectronUserDataDir(), "globalStorage", "state.vscdb");
}
function getWorkspaceStorageDir() {
  return join(getElectronUserDataDir(), "workspaceStorage");
}
function getLogDir() {
  const p = currentPlatform();
  switch (p) {
    case "win32":
      return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Antigravity", "logs");
    case "darwin":
      return join(homedir(), "Library", "Application Support", "Antigravity", "logs");
    case "linux":
      return join(homedir(), ".config", "Antigravity", "logs");
  }
}
function getDefaultDbPath() {
  return join(homedir(), ".ag-kernel", "monitor.db");
}
var init_paths = () => {};

// node_modules/chalk/source/vendor/ansi-styles/index.js
function assembleStyles() {
  const codes = new Map;
  for (const [groupName, group] of Object.entries(styles)) {
    for (const [styleName, style] of Object.entries(group)) {
      styles[styleName] = {
        open: `\x1B[${style[0]}m`,
        close: `\x1B[${style[1]}m`
      };
      group[styleName] = styles[styleName];
      codes.set(style[0], style[1]);
    }
    Object.defineProperty(styles, groupName, {
      value: group,
      enumerable: false
    });
  }
  Object.defineProperty(styles, "codes", {
    value: codes,
    enumerable: false
  });
  styles.color.close = "\x1B[39m";
  styles.bgColor.close = "\x1B[49m";
  styles.color.ansi = wrapAnsi16();
  styles.color.ansi256 = wrapAnsi256();
  styles.color.ansi16m = wrapAnsi16m();
  styles.bgColor.ansi = wrapAnsi16(ANSI_BACKGROUND_OFFSET);
  styles.bgColor.ansi256 = wrapAnsi256(ANSI_BACKGROUND_OFFSET);
  styles.bgColor.ansi16m = wrapAnsi16m(ANSI_BACKGROUND_OFFSET);
  Object.defineProperties(styles, {
    rgbToAnsi256: {
      value(red, green, blue) {
        if (red === green && green === blue) {
          if (red < 8) {
            return 16;
          }
          if (red > 248) {
            return 231;
          }
          return Math.round((red - 8) / 247 * 24) + 232;
        }
        return 16 + 36 * Math.round(red / 255 * 5) + 6 * Math.round(green / 255 * 5) + Math.round(blue / 255 * 5);
      },
      enumerable: false
    },
    hexToRgb: {
      value(hex) {
        const matches = /[a-f\d]{6}|[a-f\d]{3}/i.exec(hex.toString(16));
        if (!matches) {
          return [0, 0, 0];
        }
        let [colorString] = matches;
        if (colorString.length === 3) {
          colorString = [...colorString].map((character) => character + character).join("");
        }
        const integer = Number.parseInt(colorString, 16);
        return [
          integer >> 16 & 255,
          integer >> 8 & 255,
          integer & 255
        ];
      },
      enumerable: false
    },
    hexToAnsi256: {
      value: (hex) => styles.rgbToAnsi256(...styles.hexToRgb(hex)),
      enumerable: false
    },
    ansi256ToAnsi: {
      value(code) {
        if (code < 8) {
          return 30 + code;
        }
        if (code < 16) {
          return 90 + (code - 8);
        }
        let red;
        let green;
        let blue;
        if (code >= 232) {
          red = ((code - 232) * 10 + 8) / 255;
          green = red;
          blue = red;
        } else {
          code -= 16;
          const remainder = code % 36;
          red = Math.floor(code / 36) / 5;
          green = Math.floor(remainder / 6) / 5;
          blue = remainder % 6 / 5;
        }
        const value = Math.max(red, green, blue) * 2;
        if (value === 0) {
          return 30;
        }
        let result = 30 + (Math.round(blue) << 2 | Math.round(green) << 1 | Math.round(red));
        if (value === 2) {
          result += 60;
        }
        return result;
      },
      enumerable: false
    },
    rgbToAnsi: {
      value: (red, green, blue) => styles.ansi256ToAnsi(styles.rgbToAnsi256(red, green, blue)),
      enumerable: false
    },
    hexToAnsi: {
      value: (hex) => styles.ansi256ToAnsi(styles.hexToAnsi256(hex)),
      enumerable: false
    }
  });
  return styles;
}
var ANSI_BACKGROUND_OFFSET = 10, wrapAnsi16 = (offset = 0) => (code) => `\x1B[${code + offset}m`, wrapAnsi256 = (offset = 0) => (code) => `\x1B[${38 + offset};5;${code}m`, wrapAnsi16m = (offset = 0) => (red, green, blue) => `\x1B[${38 + offset};2;${red};${green};${blue}m`, styles, modifierNames, foregroundColorNames, backgroundColorNames, colorNames, ansiStyles, ansi_styles_default;
var init_ansi_styles = __esm(() => {
  styles = {
    modifier: {
      reset: [0, 0],
      bold: [1, 22],
      dim: [2, 22],
      italic: [3, 23],
      underline: [4, 24],
      overline: [53, 55],
      inverse: [7, 27],
      hidden: [8, 28],
      strikethrough: [9, 29]
    },
    color: {
      black: [30, 39],
      red: [31, 39],
      green: [32, 39],
      yellow: [33, 39],
      blue: [34, 39],
      magenta: [35, 39],
      cyan: [36, 39],
      white: [37, 39],
      blackBright: [90, 39],
      gray: [90, 39],
      grey: [90, 39],
      redBright: [91, 39],
      greenBright: [92, 39],
      yellowBright: [93, 39],
      blueBright: [94, 39],
      magentaBright: [95, 39],
      cyanBright: [96, 39],
      whiteBright: [97, 39]
    },
    bgColor: {
      bgBlack: [40, 49],
      bgRed: [41, 49],
      bgGreen: [42, 49],
      bgYellow: [43, 49],
      bgBlue: [44, 49],
      bgMagenta: [45, 49],
      bgCyan: [46, 49],
      bgWhite: [47, 49],
      bgBlackBright: [100, 49],
      bgGray: [100, 49],
      bgGrey: [100, 49],
      bgRedBright: [101, 49],
      bgGreenBright: [102, 49],
      bgYellowBright: [103, 49],
      bgBlueBright: [104, 49],
      bgMagentaBright: [105, 49],
      bgCyanBright: [106, 49],
      bgWhiteBright: [107, 49]
    }
  };
  modifierNames = Object.keys(styles.modifier);
  foregroundColorNames = Object.keys(styles.color);
  backgroundColorNames = Object.keys(styles.bgColor);
  colorNames = [...foregroundColorNames, ...backgroundColorNames];
  ansiStyles = assembleStyles();
  ansi_styles_default = ansiStyles;
});

// node_modules/chalk/source/vendor/supports-color/index.js
import process2 from "process";
import os from "os";
import tty from "tty";
function hasFlag(flag, argv = globalThis.Deno ? globalThis.Deno.args : process2.argv) {
  const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
  const position = argv.indexOf(prefix + flag);
  const terminatorPosition = argv.indexOf("--");
  return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
}
function envForceColor() {
  if ("FORCE_COLOR" in env) {
    if (env.FORCE_COLOR === "true") {
      return 1;
    }
    if (env.FORCE_COLOR === "false") {
      return 0;
    }
    return env.FORCE_COLOR.length === 0 ? 1 : Math.min(Number.parseInt(env.FORCE_COLOR, 10), 3);
  }
}
function translateLevel(level) {
  if (level === 0) {
    return false;
  }
  return {
    level,
    hasBasic: true,
    has256: level >= 2,
    has16m: level >= 3
  };
}
function _supportsColor(haveStream, { streamIsTTY, sniffFlags = true } = {}) {
  const noFlagForceColor = envForceColor();
  if (noFlagForceColor !== undefined) {
    flagForceColor = noFlagForceColor;
  }
  const forceColor = sniffFlags ? flagForceColor : noFlagForceColor;
  if (forceColor === 0) {
    return 0;
  }
  if (sniffFlags) {
    if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) {
      return 3;
    }
    if (hasFlag("color=256")) {
      return 2;
    }
  }
  if ("TF_BUILD" in env && "AGENT_NAME" in env) {
    return 1;
  }
  if (haveStream && !streamIsTTY && forceColor === undefined) {
    return 0;
  }
  const min = forceColor || 0;
  if (env.TERM === "dumb") {
    return min;
  }
  if (process2.platform === "win32") {
    const osRelease = os.release().split(".");
    if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
      return Number(osRelease[2]) >= 14931 ? 3 : 2;
    }
    return 1;
  }
  if ("CI" in env) {
    if (["GITHUB_ACTIONS", "GITEA_ACTIONS", "CIRCLECI"].some((key) => (key in env))) {
      return 3;
    }
    if (["TRAVIS", "APPVEYOR", "GITLAB_CI", "BUILDKITE", "DRONE"].some((sign) => (sign in env)) || env.CI_NAME === "codeship") {
      return 1;
    }
    return min;
  }
  if ("TEAMCITY_VERSION" in env) {
    return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
  }
  if (env.COLORTERM === "truecolor") {
    return 3;
  }
  if (env.TERM === "xterm-kitty") {
    return 3;
  }
  if (env.TERM === "xterm-ghostty") {
    return 3;
  }
  if (env.TERM === "wezterm") {
    return 3;
  }
  if ("TERM_PROGRAM" in env) {
    const version = Number.parseInt((env.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
    switch (env.TERM_PROGRAM) {
      case "iTerm.app": {
        return version >= 3 ? 3 : 2;
      }
      case "Apple_Terminal": {
        return 2;
      }
    }
  }
  if (/-256(color)?$/i.test(env.TERM)) {
    return 2;
  }
  if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
    return 1;
  }
  if ("COLORTERM" in env) {
    return 1;
  }
  return min;
}
function createSupportsColor(stream, options = {}) {
  const level = _supportsColor(stream, {
    streamIsTTY: stream && stream.isTTY,
    ...options
  });
  return translateLevel(level);
}
var env, flagForceColor, supportsColor, supports_color_default;
var init_supports_color = __esm(() => {
  ({ env } = process2);
  if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) {
    flagForceColor = 0;
  } else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) {
    flagForceColor = 1;
  }
  supportsColor = {
    stdout: createSupportsColor({ isTTY: tty.isatty(1) }),
    stderr: createSupportsColor({ isTTY: tty.isatty(2) })
  };
  supports_color_default = supportsColor;
});

// node_modules/chalk/source/utilities.js
function stringReplaceAll(string, substring, replacer) {
  let index = string.indexOf(substring);
  if (index === -1) {
    return string;
  }
  const substringLength = substring.length;
  let endIndex = 0;
  let returnValue = "";
  do {
    returnValue += string.slice(endIndex, index) + substring + replacer;
    endIndex = index + substringLength;
    index = string.indexOf(substring, endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}
function stringEncaseCRLFWithFirstIndex(string, prefix, postfix, index) {
  let endIndex = 0;
  let returnValue = "";
  do {
    const gotCR = string[index - 1] === "\r";
    returnValue += string.slice(endIndex, gotCR ? index - 1 : index) + prefix + (gotCR ? `\r
` : `
`) + postfix;
    endIndex = index + 1;
    index = string.indexOf(`
`, endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}

// node_modules/chalk/source/index.js
function createChalk(options) {
  return chalkFactory(options);
}
var stdoutColor, stderrColor, GENERATOR, STYLER, IS_EMPTY, levelMapping, styles2, applyOptions = (object, options = {}) => {
  if (options.level && !(Number.isInteger(options.level) && options.level >= 0 && options.level <= 3)) {
    throw new Error("The `level` option should be an integer from 0 to 3");
  }
  const colorLevel = stdoutColor ? stdoutColor.level : 0;
  object.level = options.level === undefined ? colorLevel : options.level;
}, chalkFactory = (options) => {
  const chalk = (...strings) => strings.join(" ");
  applyOptions(chalk, options);
  Object.setPrototypeOf(chalk, createChalk.prototype);
  return chalk;
}, getModelAnsi = (model, level, type, ...arguments_) => {
  if (model === "rgb") {
    if (level === "ansi16m") {
      return ansi_styles_default[type].ansi16m(...arguments_);
    }
    if (level === "ansi256") {
      return ansi_styles_default[type].ansi256(ansi_styles_default.rgbToAnsi256(...arguments_));
    }
    return ansi_styles_default[type].ansi(ansi_styles_default.rgbToAnsi(...arguments_));
  }
  if (model === "hex") {
    return getModelAnsi("rgb", level, type, ...ansi_styles_default.hexToRgb(...arguments_));
  }
  return ansi_styles_default[type][model](...arguments_);
}, usedModels, proto, createStyler = (open, close, parent) => {
  let openAll;
  let closeAll;
  if (parent === undefined) {
    openAll = open;
    closeAll = close;
  } else {
    openAll = parent.openAll + open;
    closeAll = close + parent.closeAll;
  }
  return {
    open,
    close,
    openAll,
    closeAll,
    parent
  };
}, createBuilder = (self, _styler, _isEmpty) => {
  const builder = (...arguments_) => applyStyle(builder, arguments_.length === 1 ? "" + arguments_[0] : arguments_.join(" "));
  Object.setPrototypeOf(builder, proto);
  builder[GENERATOR] = self;
  builder[STYLER] = _styler;
  builder[IS_EMPTY] = _isEmpty;
  return builder;
}, applyStyle = (self, string) => {
  if (self.level <= 0 || !string) {
    return self[IS_EMPTY] ? "" : string;
  }
  let styler = self[STYLER];
  if (styler === undefined) {
    return string;
  }
  const { openAll, closeAll } = styler;
  if (string.includes("\x1B")) {
    while (styler !== undefined) {
      string = stringReplaceAll(string, styler.close, styler.open);
      styler = styler.parent;
    }
  }
  const lfIndex = string.indexOf(`
`);
  if (lfIndex !== -1) {
    string = stringEncaseCRLFWithFirstIndex(string, closeAll, openAll, lfIndex);
  }
  return openAll + string + closeAll;
}, chalk, chalkStderr, source_default;
var init_source = __esm(() => {
  init_ansi_styles();
  init_supports_color();
  ({ stdout: stdoutColor, stderr: stderrColor } = supports_color_default);
  GENERATOR = Symbol("GENERATOR");
  STYLER = Symbol("STYLER");
  IS_EMPTY = Symbol("IS_EMPTY");
  levelMapping = [
    "ansi",
    "ansi",
    "ansi256",
    "ansi16m"
  ];
  styles2 = Object.create(null);
  Object.setPrototypeOf(createChalk.prototype, Function.prototype);
  for (const [styleName, style] of Object.entries(ansi_styles_default)) {
    styles2[styleName] = {
      get() {
        const builder = createBuilder(this, createStyler(style.open, style.close, this[STYLER]), this[IS_EMPTY]);
        Object.defineProperty(this, styleName, { value: builder });
        return builder;
      }
    };
  }
  styles2.visible = {
    get() {
      const builder = createBuilder(this, this[STYLER], true);
      Object.defineProperty(this, "visible", { value: builder });
      return builder;
    }
  };
  usedModels = ["rgb", "hex", "ansi256"];
  for (const model of usedModels) {
    styles2[model] = {
      get() {
        const { level } = this;
        return function(...arguments_) {
          const styler = createStyler(getModelAnsi(model, levelMapping[level], "color", ...arguments_), ansi_styles_default.color.close, this[STYLER]);
          return createBuilder(this, styler, this[IS_EMPTY]);
        };
      }
    };
    const bgModel = "bg" + model[0].toUpperCase() + model.slice(1);
    styles2[bgModel] = {
      get() {
        const { level } = this;
        return function(...arguments_) {
          const styler = createStyler(getModelAnsi(model, levelMapping[level], "bgColor", ...arguments_), ansi_styles_default.bgColor.close, this[STYLER]);
          return createBuilder(this, styler, this[IS_EMPTY]);
        };
      }
    };
  }
  proto = Object.defineProperties(() => {}, {
    ...styles2,
    level: {
      enumerable: true,
      get() {
        return this[GENERATOR].level;
      },
      set(level) {
        this[GENERATOR].level = level;
      }
    }
  });
  Object.defineProperties(createChalk.prototype, styles2);
  chalk = createChalk();
  chalkStderr = createChalk({ level: stderrColor ? stderrColor.level : 0 });
  source_default = chalk;
});

// node_modules/cli-table3/src/debug.js
var require_debug = __commonJS((exports, module) => {
  var messages = [];
  var level = 0;
  var debug = (msg, min) => {
    if (level >= min) {
      messages.push(msg);
    }
  };
  debug.WARN = 1;
  debug.INFO = 2;
  debug.DEBUG = 3;
  debug.reset = () => {
    messages = [];
  };
  debug.setDebugLevel = (v) => {
    level = v;
  };
  debug.warn = (msg) => debug(msg, debug.WARN);
  debug.info = (msg) => debug(msg, debug.INFO);
  debug.debug = (msg) => debug(msg, debug.DEBUG);
  debug.debugMessages = () => messages;
  module.exports = debug;
});

// node_modules/ansi-regex/index.js
var require_ansi_regex = __commonJS((exports, module) => {
  module.exports = ({ onlyFirst = false } = {}) => {
    const pattern = [
      "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
      "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))"
    ].join("|");
    return new RegExp(pattern, onlyFirst ? undefined : "g");
  };
});

// node_modules/strip-ansi/index.js
var require_strip_ansi = __commonJS((exports, module) => {
  var ansiRegex = require_ansi_regex();
  module.exports = (string) => typeof string === "string" ? string.replace(ansiRegex(), "") : string;
});

// node_modules/is-fullwidth-code-point/index.js
var require_is_fullwidth_code_point = __commonJS((exports, module) => {
  var isFullwidthCodePoint = (codePoint) => {
    if (Number.isNaN(codePoint)) {
      return false;
    }
    if (codePoint >= 4352 && (codePoint <= 4447 || codePoint === 9001 || codePoint === 9002 || 11904 <= codePoint && codePoint <= 12871 && codePoint !== 12351 || 12880 <= codePoint && codePoint <= 19903 || 19968 <= codePoint && codePoint <= 42182 || 43360 <= codePoint && codePoint <= 43388 || 44032 <= codePoint && codePoint <= 55203 || 63744 <= codePoint && codePoint <= 64255 || 65040 <= codePoint && codePoint <= 65049 || 65072 <= codePoint && codePoint <= 65131 || 65281 <= codePoint && codePoint <= 65376 || 65504 <= codePoint && codePoint <= 65510 || 110592 <= codePoint && codePoint <= 110593 || 127488 <= codePoint && codePoint <= 127569 || 131072 <= codePoint && codePoint <= 262141)) {
      return true;
    }
    return false;
  };
  module.exports = isFullwidthCodePoint;
  module.exports.default = isFullwidthCodePoint;
});

// node_modules/emoji-regex/index.js
var require_emoji_regex = __commonJS((exports, module) => {
  module.exports = function() {
    return /\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62(?:\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67|\uDB40\uDC73\uDB40\uDC63\uDB40\uDC74|\uDB40\uDC77\uDB40\uDC6C\uDB40\uDC73)\uDB40\uDC7F|\uD83D\uDC68(?:\uD83C\uDFFC\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68\uD83C\uDFFB|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFF\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB-\uDFFE])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFE\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB-\uDFFD])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFD\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB\uDFFC])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\u200D(?:\u2764\uFE0F\u200D(?:\uD83D\uDC8B\u200D)?\uD83D\uDC68|(?:\uD83D[\uDC68\uDC69])\u200D(?:\uD83D\uDC66\u200D\uD83D\uDC66|\uD83D\uDC67\u200D(?:\uD83D[\uDC66\uDC67]))|\uD83D\uDC66\u200D\uD83D\uDC66|\uD83D\uDC67\u200D(?:\uD83D[\uDC66\uDC67])|(?:\uD83D[\uDC68\uDC69])\u200D(?:\uD83D[\uDC66\uDC67])|[\u2695\u2696\u2708]\uFE0F|\uD83D[\uDC66\uDC67]|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|(?:\uD83C\uDFFB\u200D[\u2695\u2696\u2708]|\uD83C\uDFFF\u200D[\u2695\u2696\u2708]|\uD83C\uDFFE\u200D[\u2695\u2696\u2708]|\uD83C\uDFFD\u200D[\u2695\u2696\u2708]|\uD83C\uDFFC\u200D[\u2695\u2696\u2708])\uFE0F|\uD83C\uDFFB\u200D(?:\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C[\uDFFB-\uDFFF])|(?:\uD83E\uDDD1\uD83C\uDFFB\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1|\uD83D\uDC69\uD83C\uDFFC\u200D\uD83E\uDD1D\u200D\uD83D\uDC69)\uD83C\uDFFB|\uD83E\uDDD1(?:\uD83C\uDFFF\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1(?:\uD83C[\uDFFB-\uDFFF])|\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1)|(?:\uD83E\uDDD1\uD83C\uDFFE\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1|\uD83D\uDC69\uD83C\uDFFF\u200D\uD83E\uDD1D\u200D(?:\uD83D[\uDC68\uDC69]))(?:\uD83C[\uDFFB-\uDFFE])|(?:\uD83E\uDDD1\uD83C\uDFFC\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1|\uD83D\uDC69\uD83C\uDFFD\u200D\uD83E\uDD1D\u200D\uD83D\uDC69)(?:\uD83C[\uDFFB\uDFFC])|\uD83D\uDC69(?:\uD83C\uDFFE\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB-\uDFFD\uDFFF])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFC\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB\uDFFD-\uDFFF])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFB\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFC-\uDFFF])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFD\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\u200D(?:\u2764\uFE0F\u200D(?:\uD83D\uDC8B\u200D(?:\uD83D[\uDC68\uDC69])|\uD83D[\uDC68\uDC69])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFF\u200D(?:\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD]))|\uD83D\uDC69\u200D\uD83D\uDC69\u200D(?:\uD83D\uDC66\u200D\uD83D\uDC66|\uD83D\uDC67\u200D(?:\uD83D[\uDC66\uDC67]))|(?:\uD83E\uDDD1\uD83C\uDFFD\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1|\uD83D\uDC69\uD83C\uDFFE\u200D\uD83E\uDD1D\u200D\uD83D\uDC69)(?:\uD83C[\uDFFB-\uDFFD])|\uD83D\uDC69\u200D\uD83D\uDC66\u200D\uD83D\uDC66|\uD83D\uDC69\u200D\uD83D\uDC69\u200D(?:\uD83D[\uDC66\uDC67])|(?:\uD83D\uDC41\uFE0F\u200D\uD83D\uDDE8|\uD83D\uDC69(?:\uD83C\uDFFF\u200D[\u2695\u2696\u2708]|\uD83C\uDFFE\u200D[\u2695\u2696\u2708]|\uD83C\uDFFC\u200D[\u2695\u2696\u2708]|\uD83C\uDFFB\u200D[\u2695\u2696\u2708]|\uD83C\uDFFD\u200D[\u2695\u2696\u2708]|\u200D[\u2695\u2696\u2708])|(?:(?:\u26F9|\uD83C[\uDFCB\uDFCC]|\uD83D\uDD75)\uFE0F|\uD83D\uDC6F|\uD83E[\uDD3C\uDDDE\uDDDF])\u200D[\u2640\u2642]|(?:\u26F9|\uD83C[\uDFCB\uDFCC]|\uD83D\uDD75)(?:\uD83C[\uDFFB-\uDFFF])\u200D[\u2640\u2642]|(?:\uD83C[\uDFC3\uDFC4\uDFCA]|\uD83D[\uDC6E\uDC71\uDC73\uDC77\uDC81\uDC82\uDC86\uDC87\uDE45-\uDE47\uDE4B\uDE4D\uDE4E\uDEA3\uDEB4-\uDEB6]|\uD83E[\uDD26\uDD37-\uDD39\uDD3D\uDD3E\uDDB8\uDDB9\uDDCD-\uDDCF\uDDD6-\uDDDD])(?:(?:\uD83C[\uDFFB-\uDFFF])\u200D[\u2640\u2642]|\u200D[\u2640\u2642])|\uD83C\uDFF4\u200D\u2620)\uFE0F|\uD83D\uDC69\u200D\uD83D\uDC67\u200D(?:\uD83D[\uDC66\uDC67])|\uD83C\uDFF3\uFE0F\u200D\uD83C\uDF08|\uD83D\uDC15\u200D\uD83E\uDDBA|\uD83D\uDC69\u200D\uD83D\uDC66|\uD83D\uDC69\u200D\uD83D\uDC67|\uD83C\uDDFD\uD83C\uDDF0|\uD83C\uDDF4\uD83C\uDDF2|\uD83C\uDDF6\uD83C\uDDE6|[#\*0-9]\uFE0F\u20E3|\uD83C\uDDE7(?:\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEF\uDDF1-\uDDF4\uDDF6-\uDDF9\uDDFB\uDDFC\uDDFE\uDDFF])|\uD83C\uDDF9(?:\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDED\uDDEF-\uDDF4\uDDF7\uDDF9\uDDFB\uDDFC\uDDFF])|\uD83C\uDDEA(?:\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDED\uDDF7-\uDDFA])|\uD83E\uDDD1(?:\uD83C[\uDFFB-\uDFFF])|\uD83C\uDDF7(?:\uD83C[\uDDEA\uDDF4\uDDF8\uDDFA\uDDFC])|\uD83D\uDC69(?:\uD83C[\uDFFB-\uDFFF])|\uD83C\uDDF2(?:\uD83C[\uDDE6\uDDE8-\uDDED\uDDF0-\uDDFF])|\uD83C\uDDE6(?:\uD83C[\uDDE8-\uDDEC\uDDEE\uDDF1\uDDF2\uDDF4\uDDF6-\uDDFA\uDDFC\uDDFD\uDDFF])|\uD83C\uDDF0(?:\uD83C[\uDDEA\uDDEC-\uDDEE\uDDF2\uDDF3\uDDF5\uDDF7\uDDFC\uDDFE\uDDFF])|\uD83C\uDDED(?:\uD83C[\uDDF0\uDDF2\uDDF3\uDDF7\uDDF9\uDDFA])|\uD83C\uDDE9(?:\uD83C[\uDDEA\uDDEC\uDDEF\uDDF0\uDDF2\uDDF4\uDDFF])|\uD83C\uDDFE(?:\uD83C[\uDDEA\uDDF9])|\uD83C\uDDEC(?:\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEE\uDDF1-\uDDF3\uDDF5-\uDDFA\uDDFC\uDDFE])|\uD83C\uDDF8(?:\uD83C[\uDDE6-\uDDEA\uDDEC-\uDDF4\uDDF7-\uDDF9\uDDFB\uDDFD-\uDDFF])|\uD83C\uDDEB(?:\uD83C[\uDDEE-\uDDF0\uDDF2\uDDF4\uDDF7])|\uD83C\uDDF5(?:\uD83C[\uDDE6\uDDEA-\uDDED\uDDF0-\uDDF3\uDDF7-\uDDF9\uDDFC\uDDFE])|\uD83C\uDDFB(?:\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDEE\uDDF3\uDDFA])|\uD83C\uDDF3(?:\uD83C[\uDDE6\uDDE8\uDDEA-\uDDEC\uDDEE\uDDF1\uDDF4\uDDF5\uDDF7\uDDFA\uDDFF])|\uD83C\uDDE8(?:\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDEE\uDDF0-\uDDF5\uDDF7\uDDFA-\uDDFF])|\uD83C\uDDF1(?:\uD83C[\uDDE6-\uDDE8\uDDEE\uDDF0\uDDF7-\uDDFB\uDDFE])|\uD83C\uDDFF(?:\uD83C[\uDDE6\uDDF2\uDDFC])|\uD83C\uDDFC(?:\uD83C[\uDDEB\uDDF8])|\uD83C\uDDFA(?:\uD83C[\uDDE6\uDDEC\uDDF2\uDDF3\uDDF8\uDDFE\uDDFF])|\uD83C\uDDEE(?:\uD83C[\uDDE8-\uDDEA\uDDF1-\uDDF4\uDDF6-\uDDF9])|\uD83C\uDDEF(?:\uD83C[\uDDEA\uDDF2\uDDF4\uDDF5])|(?:\uD83C[\uDFC3\uDFC4\uDFCA]|\uD83D[\uDC6E\uDC71\uDC73\uDC77\uDC81\uDC82\uDC86\uDC87\uDE45-\uDE47\uDE4B\uDE4D\uDE4E\uDEA3\uDEB4-\uDEB6]|\uD83E[\uDD26\uDD37-\uDD39\uDD3D\uDD3E\uDDB8\uDDB9\uDDCD-\uDDCF\uDDD6-\uDDDD])(?:\uD83C[\uDFFB-\uDFFF])|(?:\u26F9|\uD83C[\uDFCB\uDFCC]|\uD83D\uDD75)(?:\uD83C[\uDFFB-\uDFFF])|(?:[\u261D\u270A-\u270D]|\uD83C[\uDF85\uDFC2\uDFC7]|\uD83D[\uDC42\uDC43\uDC46-\uDC50\uDC66\uDC67\uDC6B-\uDC6D\uDC70\uDC72\uDC74-\uDC76\uDC78\uDC7C\uDC83\uDC85\uDCAA\uDD74\uDD7A\uDD90\uDD95\uDD96\uDE4C\uDE4F\uDEC0\uDECC]|\uD83E[\uDD0F\uDD18-\uDD1C\uDD1E\uDD1F\uDD30-\uDD36\uDDB5\uDDB6\uDDBB\uDDD2-\uDDD5])(?:\uD83C[\uDFFB-\uDFFF])|(?:[\u231A\u231B\u23E9-\u23EC\u23F0\u23F3\u25FD\u25FE\u2614\u2615\u2648-\u2653\u267F\u2693\u26A1\u26AA\u26AB\u26BD\u26BE\u26C4\u26C5\u26CE\u26D4\u26EA\u26F2\u26F3\u26F5\u26FA\u26FD\u2705\u270A\u270B\u2728\u274C\u274E\u2753-\u2755\u2757\u2795-\u2797\u27B0\u27BF\u2B1B\u2B1C\u2B50\u2B55]|\uD83C[\uDC04\uDCCF\uDD8E\uDD91-\uDD9A\uDDE6-\uDDFF\uDE01\uDE1A\uDE2F\uDE32-\uDE36\uDE38-\uDE3A\uDE50\uDE51\uDF00-\uDF20\uDF2D-\uDF35\uDF37-\uDF7C\uDF7E-\uDF93\uDFA0-\uDFCA\uDFCF-\uDFD3\uDFE0-\uDFF0\uDFF4\uDFF8-\uDFFF]|\uD83D[\uDC00-\uDC3E\uDC40\uDC42-\uDCFC\uDCFF-\uDD3D\uDD4B-\uDD4E\uDD50-\uDD67\uDD7A\uDD95\uDD96\uDDA4\uDDFB-\uDE4F\uDE80-\uDEC5\uDECC\uDED0-\uDED2\uDED5\uDEEB\uDEEC\uDEF4-\uDEFA\uDFE0-\uDFEB]|\uD83E[\uDD0D-\uDD3A\uDD3C-\uDD45\uDD47-\uDD71\uDD73-\uDD76\uDD7A-\uDDA2\uDDA5-\uDDAA\uDDAE-\uDDCA\uDDCD-\uDDFF\uDE70-\uDE73\uDE78-\uDE7A\uDE80-\uDE82\uDE90-\uDE95])|(?:[#\*0-9\xA9\xAE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u231A\u231B\u2328\u23CF\u23E9-\u23F3\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u261D\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u267F\u2692-\u2697\u2699\u269B\u269C\u26A0\u26A1\u26AA\u26AB\u26B0\u26B1\u26BD\u26BE\u26C4\u26C5\u26C8\u26CE\u26CF\u26D1\u26D3\u26D4\u26E9\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]|\uD83C[\uDC04\uDCCF\uDD70\uDD71\uDD7E\uDD7F\uDD8E\uDD91-\uDD9A\uDDE6-\uDDFF\uDE01\uDE02\uDE1A\uDE2F\uDE32-\uDE3A\uDE50\uDE51\uDF00-\uDF21\uDF24-\uDF93\uDF96\uDF97\uDF99-\uDF9B\uDF9E-\uDFF0\uDFF3-\uDFF5\uDFF7-\uDFFF]|\uD83D[\uDC00-\uDCFD\uDCFF-\uDD3D\uDD49-\uDD4E\uDD50-\uDD67\uDD6F\uDD70\uDD73-\uDD7A\uDD87\uDD8A-\uDD8D\uDD90\uDD95\uDD96\uDDA4\uDDA5\uDDA8\uDDB1\uDDB2\uDDBC\uDDC2-\uDDC4\uDDD1-\uDDD3\uDDDC-\uDDDE\uDDE1\uDDE3\uDDE8\uDDEF\uDDF3\uDDFA-\uDE4F\uDE80-\uDEC5\uDECB-\uDED2\uDED5\uDEE0-\uDEE5\uDEE9\uDEEB\uDEEC\uDEF0\uDEF3-\uDEFA\uDFE0-\uDFEB]|\uD83E[\uDD0D-\uDD3A\uDD3C-\uDD45\uDD47-\uDD71\uDD73-\uDD76\uDD7A-\uDDA2\uDDA5-\uDDAA\uDDAE-\uDDCA\uDDCD-\uDDFF\uDE70-\uDE73\uDE78-\uDE7A\uDE80-\uDE82\uDE90-\uDE95])\uFE0F|(?:[\u261D\u26F9\u270A-\u270D]|\uD83C[\uDF85\uDFC2-\uDFC4\uDFC7\uDFCA-\uDFCC]|\uD83D[\uDC42\uDC43\uDC46-\uDC50\uDC66-\uDC78\uDC7C\uDC81-\uDC83\uDC85-\uDC87\uDC8F\uDC91\uDCAA\uDD74\uDD75\uDD7A\uDD90\uDD95\uDD96\uDE45-\uDE47\uDE4B-\uDE4F\uDEA3\uDEB4-\uDEB6\uDEC0\uDECC]|\uD83E[\uDD0F\uDD18-\uDD1F\uDD26\uDD30-\uDD39\uDD3C-\uDD3E\uDDB5\uDDB6\uDDB8\uDDB9\uDDBB\uDDCD-\uDDCF\uDDD1-\uDDDD])/g;
  };
});

// node_modules/string-width/index.js
var require_string_width = __commonJS((exports, module) => {
  var stripAnsi = require_strip_ansi();
  var isFullwidthCodePoint = require_is_fullwidth_code_point();
  var emojiRegex = require_emoji_regex();
  var stringWidth = (string) => {
    if (typeof string !== "string" || string.length === 0) {
      return 0;
    }
    string = stripAnsi(string);
    if (string.length === 0) {
      return 0;
    }
    string = string.replace(emojiRegex(), "  ");
    let width = 0;
    for (let i = 0;i < string.length; i++) {
      const code = string.codePointAt(i);
      if (code <= 31 || code >= 127 && code <= 159) {
        continue;
      }
      if (code >= 768 && code <= 879) {
        continue;
      }
      if (code > 65535) {
        i++;
      }
      width += isFullwidthCodePoint(code) ? 2 : 1;
    }
    return width;
  };
  module.exports = stringWidth;
  module.exports.default = stringWidth;
});

// node_modules/cli-table3/src/utils.js
var require_utils = __commonJS((exports, module) => {
  var stringWidth = require_string_width();
  function codeRegex(capture) {
    return capture ? /\u001b\[((?:\d*;){0,5}\d*)m/g : /\u001b\[(?:\d*;){0,5}\d*m/g;
  }
  function strlen(str) {
    let code = codeRegex();
    let stripped = ("" + str).replace(code, "");
    let split = stripped.split(`
`);
    return split.reduce(function(memo, s) {
      return stringWidth(s) > memo ? stringWidth(s) : memo;
    }, 0);
  }
  function repeat(str, times) {
    return Array(times + 1).join(str);
  }
  function pad(str, len, pad2, dir) {
    let length = strlen(str);
    if (len + 1 >= length) {
      let padlen = len - length;
      switch (dir) {
        case "right": {
          str = repeat(pad2, padlen) + str;
          break;
        }
        case "center": {
          let right = Math.ceil(padlen / 2);
          let left = padlen - right;
          str = repeat(pad2, left) + str + repeat(pad2, right);
          break;
        }
        default: {
          str = str + repeat(pad2, padlen);
          break;
        }
      }
    }
    return str;
  }
  var codeCache = {};
  function addToCodeCache(name, on, off) {
    on = "\x1B[" + on + "m";
    off = "\x1B[" + off + "m";
    codeCache[on] = { set: name, to: true };
    codeCache[off] = { set: name, to: false };
    codeCache[name] = { on, off };
  }
  addToCodeCache("bold", 1, 22);
  addToCodeCache("italics", 3, 23);
  addToCodeCache("underline", 4, 24);
  addToCodeCache("inverse", 7, 27);
  addToCodeCache("strikethrough", 9, 29);
  function updateState(state, controlChars) {
    let controlCode = controlChars[1] ? parseInt(controlChars[1].split(";")[0]) : 0;
    if (controlCode >= 30 && controlCode <= 39 || controlCode >= 90 && controlCode <= 97) {
      state.lastForegroundAdded = controlChars[0];
      return;
    }
    if (controlCode >= 40 && controlCode <= 49 || controlCode >= 100 && controlCode <= 107) {
      state.lastBackgroundAdded = controlChars[0];
      return;
    }
    if (controlCode === 0) {
      for (let i in state) {
        if (Object.prototype.hasOwnProperty.call(state, i)) {
          delete state[i];
        }
      }
      return;
    }
    let info = codeCache[controlChars[0]];
    if (info) {
      state[info.set] = info.to;
    }
  }
  function readState(line) {
    let code = codeRegex(true);
    let controlChars = code.exec(line);
    let state = {};
    while (controlChars !== null) {
      updateState(state, controlChars);
      controlChars = code.exec(line);
    }
    return state;
  }
  function unwindState(state, ret) {
    let lastBackgroundAdded = state.lastBackgroundAdded;
    let lastForegroundAdded = state.lastForegroundAdded;
    delete state.lastBackgroundAdded;
    delete state.lastForegroundAdded;
    Object.keys(state).forEach(function(key) {
      if (state[key]) {
        ret += codeCache[key].off;
      }
    });
    if (lastBackgroundAdded && lastBackgroundAdded != "\x1B[49m") {
      ret += "\x1B[49m";
    }
    if (lastForegroundAdded && lastForegroundAdded != "\x1B[39m") {
      ret += "\x1B[39m";
    }
    return ret;
  }
  function rewindState(state, ret) {
    let lastBackgroundAdded = state.lastBackgroundAdded;
    let lastForegroundAdded = state.lastForegroundAdded;
    delete state.lastBackgroundAdded;
    delete state.lastForegroundAdded;
    Object.keys(state).forEach(function(key) {
      if (state[key]) {
        ret = codeCache[key].on + ret;
      }
    });
    if (lastBackgroundAdded && lastBackgroundAdded != "\x1B[49m") {
      ret = lastBackgroundAdded + ret;
    }
    if (lastForegroundAdded && lastForegroundAdded != "\x1B[39m") {
      ret = lastForegroundAdded + ret;
    }
    return ret;
  }
  function truncateWidth(str, desiredLength) {
    if (str.length === strlen(str)) {
      return str.substr(0, desiredLength);
    }
    while (strlen(str) > desiredLength) {
      str = str.slice(0, -1);
    }
    return str;
  }
  function truncateWidthWithAnsi(str, desiredLength) {
    let code = codeRegex(true);
    let split = str.split(codeRegex());
    let splitIndex = 0;
    let retLen = 0;
    let ret = "";
    let myArray;
    let state = {};
    while (retLen < desiredLength) {
      myArray = code.exec(str);
      let toAdd = split[splitIndex];
      splitIndex++;
      if (retLen + strlen(toAdd) > desiredLength) {
        toAdd = truncateWidth(toAdd, desiredLength - retLen);
      }
      ret += toAdd;
      retLen += strlen(toAdd);
      if (retLen < desiredLength) {
        if (!myArray) {
          break;
        }
        ret += myArray[0];
        updateState(state, myArray);
      }
    }
    return unwindState(state, ret);
  }
  function truncate(str, desiredLength, truncateChar) {
    truncateChar = truncateChar || "\u2026";
    let lengthOfStr = strlen(str);
    if (lengthOfStr <= desiredLength) {
      return str;
    }
    desiredLength -= strlen(truncateChar);
    let ret = truncateWidthWithAnsi(str, desiredLength);
    ret += truncateChar;
    const hrefTag = "\x1B]8;;\x07";
    if (str.includes(hrefTag) && !ret.includes(hrefTag)) {
      ret += hrefTag;
    }
    return ret;
  }
  function defaultOptions() {
    return {
      chars: {
        top: "\u2500",
        "top-mid": "\u252C",
        "top-left": "\u250C",
        "top-right": "\u2510",
        bottom: "\u2500",
        "bottom-mid": "\u2534",
        "bottom-left": "\u2514",
        "bottom-right": "\u2518",
        left: "\u2502",
        "left-mid": "\u251C",
        mid: "\u2500",
        "mid-mid": "\u253C",
        right: "\u2502",
        "right-mid": "\u2524",
        middle: "\u2502"
      },
      truncate: "\u2026",
      colWidths: [],
      rowHeights: [],
      colAligns: [],
      rowAligns: [],
      style: {
        "padding-left": 1,
        "padding-right": 1,
        head: ["red"],
        border: ["grey"],
        compact: false
      },
      head: []
    };
  }
  function mergeOptions(options, defaults) {
    options = options || {};
    defaults = defaults || defaultOptions();
    let ret = Object.assign({}, defaults, options);
    ret.chars = Object.assign({}, defaults.chars, options.chars);
    ret.style = Object.assign({}, defaults.style, options.style);
    return ret;
  }
  function wordWrap(maxLength, input) {
    let lines = [];
    let split = input.split(/(\s+)/g);
    let line = [];
    let lineLength = 0;
    let whitespace;
    for (let i = 0;i < split.length; i += 2) {
      let word = split[i];
      let newLength = lineLength + strlen(word);
      if (lineLength > 0 && whitespace) {
        newLength += whitespace.length;
      }
      if (newLength > maxLength) {
        if (lineLength !== 0) {
          lines.push(line.join(""));
        }
        line = [word];
        lineLength = strlen(word);
      } else {
        line.push(whitespace || "", word);
        lineLength = newLength;
      }
      whitespace = split[i + 1];
    }
    if (lineLength) {
      lines.push(line.join(""));
    }
    return lines;
  }
  function textWrap(maxLength, input) {
    let lines = [];
    let line = "";
    function pushLine(str, ws) {
      if (line.length && ws)
        line += ws;
      line += str;
      while (line.length > maxLength) {
        lines.push(line.slice(0, maxLength));
        line = line.slice(maxLength);
      }
    }
    let split = input.split(/(\s+)/g);
    for (let i = 0;i < split.length; i += 2) {
      pushLine(split[i], i && split[i - 1]);
    }
    if (line.length)
      lines.push(line);
    return lines;
  }
  function multiLineWordWrap(maxLength, input, wrapOnWordBoundary = true) {
    let output = [];
    input = input.split(`
`);
    const handler = wrapOnWordBoundary ? wordWrap : textWrap;
    for (let i = 0;i < input.length; i++) {
      output.push.apply(output, handler(maxLength, input[i]));
    }
    return output;
  }
  function colorizeLines(input) {
    let state = {};
    let output = [];
    for (let i = 0;i < input.length; i++) {
      let line = rewindState(state, input[i]);
      state = readState(line);
      let temp = Object.assign({}, state);
      output.push(unwindState(temp, line));
    }
    return output;
  }
  function hyperlink(url, text) {
    const OSC = "\x1B]";
    const BEL = "\x07";
    const SEP = ";";
    return [OSC, "8", SEP, SEP, url || text, BEL, text, OSC, "8", SEP, SEP, BEL].join("");
  }
  module.exports = {
    strlen,
    repeat,
    pad,
    truncate,
    mergeOptions,
    wordWrap: multiLineWordWrap,
    colorizeLines,
    hyperlink
  };
});

// node_modules/@colors/colors/lib/styles.js
var require_styles = __commonJS((exports, module) => {
  var styles3 = {};
  module["exports"] = styles3;
  var codes = {
    reset: [0, 0],
    bold: [1, 22],
    dim: [2, 22],
    italic: [3, 23],
    underline: [4, 24],
    inverse: [7, 27],
    hidden: [8, 28],
    strikethrough: [9, 29],
    black: [30, 39],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    white: [37, 39],
    gray: [90, 39],
    grey: [90, 39],
    brightRed: [91, 39],
    brightGreen: [92, 39],
    brightYellow: [93, 39],
    brightBlue: [94, 39],
    brightMagenta: [95, 39],
    brightCyan: [96, 39],
    brightWhite: [97, 39],
    bgBlack: [40, 49],
    bgRed: [41, 49],
    bgGreen: [42, 49],
    bgYellow: [43, 49],
    bgBlue: [44, 49],
    bgMagenta: [45, 49],
    bgCyan: [46, 49],
    bgWhite: [47, 49],
    bgGray: [100, 49],
    bgGrey: [100, 49],
    bgBrightRed: [101, 49],
    bgBrightGreen: [102, 49],
    bgBrightYellow: [103, 49],
    bgBrightBlue: [104, 49],
    bgBrightMagenta: [105, 49],
    bgBrightCyan: [106, 49],
    bgBrightWhite: [107, 49],
    blackBG: [40, 49],
    redBG: [41, 49],
    greenBG: [42, 49],
    yellowBG: [43, 49],
    blueBG: [44, 49],
    magentaBG: [45, 49],
    cyanBG: [46, 49],
    whiteBG: [47, 49]
  };
  Object.keys(codes).forEach(function(key) {
    var val = codes[key];
    var style = styles3[key] = [];
    style.open = "\x1B[" + val[0] + "m";
    style.close = "\x1B[" + val[1] + "m";
  });
});

// node_modules/@colors/colors/lib/system/has-flag.js
var require_has_flag = __commonJS((exports, module) => {
  module.exports = function(flag, argv) {
    argv = argv || process.argv;
    var terminatorPos = argv.indexOf("--");
    var prefix = /^-{1,2}/.test(flag) ? "" : "--";
    var pos = argv.indexOf(prefix + flag);
    return pos !== -1 && (terminatorPos === -1 ? true : pos < terminatorPos);
  };
});

// node_modules/@colors/colors/lib/system/supports-colors.js
var require_supports_colors = __commonJS((exports, module) => {
  var os2 = __require("os");
  var hasFlag2 = require_has_flag();
  var env2 = process.env;
  var forceColor = undefined;
  if (hasFlag2("no-color") || hasFlag2("no-colors") || hasFlag2("color=false")) {
    forceColor = false;
  } else if (hasFlag2("color") || hasFlag2("colors") || hasFlag2("color=true") || hasFlag2("color=always")) {
    forceColor = true;
  }
  if ("FORCE_COLOR" in env2) {
    forceColor = env2.FORCE_COLOR.length === 0 || parseInt(env2.FORCE_COLOR, 10) !== 0;
  }
  function translateLevel2(level) {
    if (level === 0) {
      return false;
    }
    return {
      level,
      hasBasic: true,
      has256: level >= 2,
      has16m: level >= 3
    };
  }
  function supportsColor2(stream) {
    if (forceColor === false) {
      return 0;
    }
    if (hasFlag2("color=16m") || hasFlag2("color=full") || hasFlag2("color=truecolor")) {
      return 3;
    }
    if (hasFlag2("color=256")) {
      return 2;
    }
    if (stream && !stream.isTTY && forceColor !== true) {
      return 0;
    }
    var min = forceColor ? 1 : 0;
    if (process.platform === "win32") {
      var osRelease = os2.release().split(".");
      if (Number(process.versions.node.split(".")[0]) >= 8 && Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
        return Number(osRelease[2]) >= 14931 ? 3 : 2;
      }
      return 1;
    }
    if ("CI" in env2) {
      if (["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI"].some(function(sign) {
        return sign in env2;
      }) || env2.CI_NAME === "codeship") {
        return 1;
      }
      return min;
    }
    if ("TEAMCITY_VERSION" in env2) {
      return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env2.TEAMCITY_VERSION) ? 1 : 0;
    }
    if ("TERM_PROGRAM" in env2) {
      var version = parseInt((env2.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
      switch (env2.TERM_PROGRAM) {
        case "iTerm.app":
          return version >= 3 ? 3 : 2;
        case "Hyper":
          return 3;
        case "Apple_Terminal":
          return 2;
      }
    }
    if (/-256(color)?$/i.test(env2.TERM)) {
      return 2;
    }
    if (/^screen|^xterm|^vt100|^rxvt|color|ansi|cygwin|linux/i.test(env2.TERM)) {
      return 1;
    }
    if ("COLORTERM" in env2) {
      return 1;
    }
    if (env2.TERM === "dumb") {
      return min;
    }
    return min;
  }
  function getSupportLevel(stream) {
    var level = supportsColor2(stream);
    return translateLevel2(level);
  }
  module.exports = {
    supportsColor: getSupportLevel,
    stdout: getSupportLevel(process.stdout),
    stderr: getSupportLevel(process.stderr)
  };
});

// node_modules/@colors/colors/lib/custom/trap.js
var require_trap = __commonJS((exports, module) => {
  module["exports"] = function runTheTrap(text, options) {
    var result = "";
    text = text || "Run the trap, drop the bass";
    text = text.split("");
    var trap = {
      a: ["@", "\u0104", "\u023A", "\u0245", "\u0394", "\u039B", "\u0414"],
      b: ["\xDF", "\u0181", "\u0243", "\u026E", "\u03B2", "\u0E3F"],
      c: ["\xA9", "\u023B", "\u03FE"],
      d: ["\xD0", "\u018A", "\u0500", "\u0501", "\u0502", "\u0503"],
      e: [
        "\xCB",
        "\u0115",
        "\u018E",
        "\u0258",
        "\u03A3",
        "\u03BE",
        "\u04BC",
        "\u0A6C"
      ],
      f: ["\u04FA"],
      g: ["\u0262"],
      h: ["\u0126", "\u0195", "\u04A2", "\u04BA", "\u04C7", "\u050A"],
      i: ["\u0F0F"],
      j: ["\u0134"],
      k: ["\u0138", "\u04A0", "\u04C3", "\u051E"],
      l: ["\u0139"],
      m: ["\u028D", "\u04CD", "\u04CE", "\u0520", "\u0521", "\u0D69"],
      n: ["\xD1", "\u014B", "\u019D", "\u0376", "\u03A0", "\u048A"],
      o: [
        "\xD8",
        "\xF5",
        "\xF8",
        "\u01FE",
        "\u0298",
        "\u047A",
        "\u05DD",
        "\u06DD",
        "\u0E4F"
      ],
      p: ["\u01F7", "\u048E"],
      q: ["\u09CD"],
      r: ["\xAE", "\u01A6", "\u0210", "\u024C", "\u0280", "\u042F"],
      s: ["\xA7", "\u03DE", "\u03DF", "\u03E8"],
      t: ["\u0141", "\u0166", "\u0373"],
      u: ["\u01B1", "\u054D"],
      v: ["\u05D8"],
      w: ["\u0428", "\u0460", "\u047C", "\u0D70"],
      x: ["\u04B2", "\u04FE", "\u04FC", "\u04FD"],
      y: ["\xA5", "\u04B0", "\u04CB"],
      z: ["\u01B5", "\u0240"]
    };
    text.forEach(function(c) {
      c = c.toLowerCase();
      var chars = trap[c] || [" "];
      var rand = Math.floor(Math.random() * chars.length);
      if (typeof trap[c] !== "undefined") {
        result += trap[c][rand];
      } else {
        result += c;
      }
    });
    return result;
  };
});

// node_modules/@colors/colors/lib/custom/zalgo.js
var require_zalgo = __commonJS((exports, module) => {
  module["exports"] = function zalgo(text, options) {
    text = text || "   he is here   ";
    var soul = {
      up: [
        "\u030D",
        "\u030E",
        "\u0304",
        "\u0305",
        "\u033F",
        "\u0311",
        "\u0306",
        "\u0310",
        "\u0352",
        "\u0357",
        "\u0351",
        "\u0307",
        "\u0308",
        "\u030A",
        "\u0342",
        "\u0313",
        "\u0308",
        "\u034A",
        "\u034B",
        "\u034C",
        "\u0303",
        "\u0302",
        "\u030C",
        "\u0350",
        "\u0300",
        "\u0301",
        "\u030B",
        "\u030F",
        "\u0312",
        "\u0313",
        "\u0314",
        "\u033D",
        "\u0309",
        "\u0363",
        "\u0364",
        "\u0365",
        "\u0366",
        "\u0367",
        "\u0368",
        "\u0369",
        "\u036A",
        "\u036B",
        "\u036C",
        "\u036D",
        "\u036E",
        "\u036F",
        "\u033E",
        "\u035B",
        "\u0346",
        "\u031A"
      ],
      down: [
        "\u0316",
        "\u0317",
        "\u0318",
        "\u0319",
        "\u031C",
        "\u031D",
        "\u031E",
        "\u031F",
        "\u0320",
        "\u0324",
        "\u0325",
        "\u0326",
        "\u0329",
        "\u032A",
        "\u032B",
        "\u032C",
        "\u032D",
        "\u032E",
        "\u032F",
        "\u0330",
        "\u0331",
        "\u0332",
        "\u0333",
        "\u0339",
        "\u033A",
        "\u033B",
        "\u033C",
        "\u0345",
        "\u0347",
        "\u0348",
        "\u0349",
        "\u034D",
        "\u034E",
        "\u0353",
        "\u0354",
        "\u0355",
        "\u0356",
        "\u0359",
        "\u035A",
        "\u0323"
      ],
      mid: [
        "\u0315",
        "\u031B",
        "\u0300",
        "\u0301",
        "\u0358",
        "\u0321",
        "\u0322",
        "\u0327",
        "\u0328",
        "\u0334",
        "\u0335",
        "\u0336",
        "\u035C",
        "\u035D",
        "\u035E",
        "\u035F",
        "\u0360",
        "\u0362",
        "\u0338",
        "\u0337",
        "\u0361",
        " \u0489"
      ]
    };
    var all = [].concat(soul.up, soul.down, soul.mid);
    function randomNumber(range) {
      var r = Math.floor(Math.random() * range);
      return r;
    }
    function isChar(character) {
      var bool = false;
      all.filter(function(i) {
        bool = i === character;
      });
      return bool;
    }
    function heComes(text2, options2) {
      var result = "";
      var counts;
      var l;
      options2 = options2 || {};
      options2["up"] = typeof options2["up"] !== "undefined" ? options2["up"] : true;
      options2["mid"] = typeof options2["mid"] !== "undefined" ? options2["mid"] : true;
      options2["down"] = typeof options2["down"] !== "undefined" ? options2["down"] : true;
      options2["size"] = typeof options2["size"] !== "undefined" ? options2["size"] : "maxi";
      text2 = text2.split("");
      for (l in text2) {
        if (isChar(l)) {
          continue;
        }
        result = result + text2[l];
        counts = { up: 0, down: 0, mid: 0 };
        switch (options2.size) {
          case "mini":
            counts.up = randomNumber(8);
            counts.mid = randomNumber(2);
            counts.down = randomNumber(8);
            break;
          case "maxi":
            counts.up = randomNumber(16) + 3;
            counts.mid = randomNumber(4) + 1;
            counts.down = randomNumber(64) + 3;
            break;
          default:
            counts.up = randomNumber(8) + 1;
            counts.mid = randomNumber(6) / 2;
            counts.down = randomNumber(8) + 1;
            break;
        }
        var arr = ["up", "mid", "down"];
        for (var d in arr) {
          var index = arr[d];
          for (var i = 0;i <= counts[index]; i++) {
            if (options2[index]) {
              result = result + soul[index][randomNumber(soul[index].length)];
            }
          }
        }
      }
      return result;
    }
    return heComes(text, options);
  };
});

// node_modules/@colors/colors/lib/maps/america.js
var require_america = __commonJS((exports, module) => {
  module["exports"] = function(colors) {
    return function(letter, i, exploded) {
      if (letter === " ")
        return letter;
      switch (i % 3) {
        case 0:
          return colors.red(letter);
        case 1:
          return colors.white(letter);
        case 2:
          return colors.blue(letter);
      }
    };
  };
});

// node_modules/@colors/colors/lib/maps/zebra.js
var require_zebra = __commonJS((exports, module) => {
  module["exports"] = function(colors) {
    return function(letter, i, exploded) {
      return i % 2 === 0 ? letter : colors.inverse(letter);
    };
  };
});

// node_modules/@colors/colors/lib/maps/rainbow.js
var require_rainbow = __commonJS((exports, module) => {
  module["exports"] = function(colors) {
    var rainbowColors = ["red", "yellow", "green", "blue", "magenta"];
    return function(letter, i, exploded) {
      if (letter === " ") {
        return letter;
      } else {
        return colors[rainbowColors[i++ % rainbowColors.length]](letter);
      }
    };
  };
});

// node_modules/@colors/colors/lib/maps/random.js
var require_random = __commonJS((exports, module) => {
  module["exports"] = function(colors) {
    var available = [
      "underline",
      "inverse",
      "grey",
      "yellow",
      "red",
      "green",
      "blue",
      "white",
      "cyan",
      "magenta",
      "brightYellow",
      "brightRed",
      "brightGreen",
      "brightBlue",
      "brightWhite",
      "brightCyan",
      "brightMagenta"
    ];
    return function(letter, i, exploded) {
      return letter === " " ? letter : colors[available[Math.round(Math.random() * (available.length - 2))]](letter);
    };
  };
});

// node_modules/@colors/colors/lib/colors.js
var require_colors = __commonJS((exports, module) => {
  var colors = {};
  module["exports"] = colors;
  colors.themes = {};
  var util = __require("util");
  var ansiStyles2 = colors.styles = require_styles();
  var defineProps = Object.defineProperties;
  var newLineRegex = new RegExp(/[\r\n]+/g);
  colors.supportsColor = require_supports_colors().supportsColor;
  if (typeof colors.enabled === "undefined") {
    colors.enabled = colors.supportsColor() !== false;
  }
  colors.enable = function() {
    colors.enabled = true;
  };
  colors.disable = function() {
    colors.enabled = false;
  };
  colors.stripColors = colors.strip = function(str) {
    return ("" + str).replace(/\x1B\[\d+m/g, "");
  };
  var stylize = colors.stylize = function stylize2(str, style) {
    if (!colors.enabled) {
      return str + "";
    }
    var styleMap = ansiStyles2[style];
    if (!styleMap && style in colors) {
      return colors[style](str);
    }
    return styleMap.open + str + styleMap.close;
  };
  var matchOperatorsRe = /[|\\{}()[\]^$+*?.]/g;
  var escapeStringRegexp = function(str) {
    if (typeof str !== "string") {
      throw new TypeError("Expected a string");
    }
    return str.replace(matchOperatorsRe, "\\$&");
  };
  function build(_styles) {
    var builder = function builder2() {
      return applyStyle2.apply(builder2, arguments);
    };
    builder._styles = _styles;
    builder.__proto__ = proto2;
    return builder;
  }
  var styles3 = function() {
    var ret = {};
    ansiStyles2.grey = ansiStyles2.gray;
    Object.keys(ansiStyles2).forEach(function(key) {
      ansiStyles2[key].closeRe = new RegExp(escapeStringRegexp(ansiStyles2[key].close), "g");
      ret[key] = {
        get: function() {
          return build(this._styles.concat(key));
        }
      };
    });
    return ret;
  }();
  var proto2 = defineProps(function colors2() {}, styles3);
  function applyStyle2() {
    var args = Array.prototype.slice.call(arguments);
    var str = args.map(function(arg) {
      if (arg != null && arg.constructor === String) {
        return arg;
      } else {
        return util.inspect(arg);
      }
    }).join(" ");
    if (!colors.enabled || !str) {
      return str;
    }
    var newLinesPresent = str.indexOf(`
`) != -1;
    var nestedStyles = this._styles;
    var i = nestedStyles.length;
    while (i--) {
      var code = ansiStyles2[nestedStyles[i]];
      str = code.open + str.replace(code.closeRe, code.open) + code.close;
      if (newLinesPresent) {
        str = str.replace(newLineRegex, function(match) {
          return code.close + match + code.open;
        });
      }
    }
    return str;
  }
  colors.setTheme = function(theme) {
    if (typeof theme === "string") {
      console.log("colors.setTheme now only accepts an object, not a string.  " + "If you are trying to set a theme from a file, it is now your (the " + "caller's) responsibility to require the file.  The old syntax " + "looked like colors.setTheme(__dirname + " + "'/../themes/generic-logging.js'); The new syntax looks like " + "colors.setTheme(require(__dirname + " + "'/../themes/generic-logging.js'));");
      return;
    }
    for (var style in theme) {
      (function(style2) {
        colors[style2] = function(str) {
          if (typeof theme[style2] === "object") {
            var out = str;
            for (var i in theme[style2]) {
              out = colors[theme[style2][i]](out);
            }
            return out;
          }
          return colors[theme[style2]](str);
        };
      })(style);
    }
  };
  function init() {
    var ret = {};
    Object.keys(styles3).forEach(function(name) {
      ret[name] = {
        get: function() {
          return build([name]);
        }
      };
    });
    return ret;
  }
  var sequencer = function sequencer2(map2, str) {
    var exploded = str.split("");
    exploded = exploded.map(map2);
    return exploded.join("");
  };
  colors.trap = require_trap();
  colors.zalgo = require_zalgo();
  colors.maps = {};
  colors.maps.america = require_america()(colors);
  colors.maps.zebra = require_zebra()(colors);
  colors.maps.rainbow = require_rainbow()(colors);
  colors.maps.random = require_random()(colors);
  for (map in colors.maps) {
    (function(map2) {
      colors[map2] = function(str) {
        return sequencer(colors.maps[map2], str);
      };
    })(map);
  }
  var map;
  defineProps(colors, init());
});

// node_modules/@colors/colors/safe.js
var require_safe = __commonJS((exports, module) => {
  var colors = require_colors();
  module["exports"] = colors;
});

// node_modules/cli-table3/src/cell.js
var require_cell = __commonJS((exports, module) => {
  var { info, debug } = require_debug();
  var utils = require_utils();

  class Cell {
    constructor(options) {
      this.setOptions(options);
      this.x = null;
      this.y = null;
    }
    setOptions(options) {
      if (["boolean", "number", "bigint", "string"].indexOf(typeof options) !== -1) {
        options = { content: "" + options };
      }
      options = options || {};
      this.options = options;
      let content = options.content;
      if (["boolean", "number", "bigint", "string"].indexOf(typeof content) !== -1) {
        this.content = String(content);
      } else if (!content) {
        this.content = this.options.href || "";
      } else {
        throw new Error("Content needs to be a primitive, got: " + typeof content);
      }
      this.colSpan = options.colSpan || 1;
      this.rowSpan = options.rowSpan || 1;
      if (this.options.href) {
        Object.defineProperty(this, "href", {
          get() {
            return this.options.href;
          }
        });
      }
    }
    mergeTableOptions(tableOptions, cells) {
      this.cells = cells;
      let optionsChars = this.options.chars || {};
      let tableChars = tableOptions.chars;
      let chars = this.chars = {};
      CHAR_NAMES.forEach(function(name) {
        setOption(optionsChars, tableChars, name, chars);
      });
      this.truncate = this.options.truncate || tableOptions.truncate;
      let style = this.options.style = this.options.style || {};
      let tableStyle = tableOptions.style;
      setOption(style, tableStyle, "padding-left", this);
      setOption(style, tableStyle, "padding-right", this);
      this.head = style.head || tableStyle.head;
      this.border = style.border || tableStyle.border;
      this.fixedWidth = tableOptions.colWidths[this.x];
      this.lines = this.computeLines(tableOptions);
      this.desiredWidth = utils.strlen(this.content) + this.paddingLeft + this.paddingRight;
      this.desiredHeight = this.lines.length;
    }
    computeLines(tableOptions) {
      const tableWordWrap = tableOptions.wordWrap || tableOptions.textWrap;
      const { wordWrap = tableWordWrap } = this.options;
      if (this.fixedWidth && wordWrap) {
        this.fixedWidth -= this.paddingLeft + this.paddingRight;
        if (this.colSpan) {
          let i = 1;
          while (i < this.colSpan) {
            this.fixedWidth += tableOptions.colWidths[this.x + i];
            i++;
          }
        }
        const { wrapOnWordBoundary: tableWrapOnWordBoundary = true } = tableOptions;
        const { wrapOnWordBoundary = tableWrapOnWordBoundary } = this.options;
        return this.wrapLines(utils.wordWrap(this.fixedWidth, this.content, wrapOnWordBoundary));
      }
      return this.wrapLines(this.content.split(`
`));
    }
    wrapLines(computedLines) {
      const lines = utils.colorizeLines(computedLines);
      if (this.href) {
        return lines.map((line) => utils.hyperlink(this.href, line));
      }
      return lines;
    }
    init(tableOptions) {
      let x = this.x;
      let y = this.y;
      this.widths = tableOptions.colWidths.slice(x, x + this.colSpan);
      this.heights = tableOptions.rowHeights.slice(y, y + this.rowSpan);
      this.width = this.widths.reduce(sumPlusOne, -1);
      this.height = this.heights.reduce(sumPlusOne, -1);
      this.hAlign = this.options.hAlign || tableOptions.colAligns[x];
      this.vAlign = this.options.vAlign || tableOptions.rowAligns[y];
      this.drawRight = x + this.colSpan == tableOptions.colWidths.length;
    }
    draw(lineNum, spanningCell) {
      if (lineNum == "top")
        return this.drawTop(this.drawRight);
      if (lineNum == "bottom")
        return this.drawBottom(this.drawRight);
      let content = utils.truncate(this.content, 10, this.truncate);
      if (!lineNum) {
        info(`${this.y}-${this.x}: ${this.rowSpan - lineNum}x${this.colSpan} Cell ${content}`);
      } else {}
      let padLen = Math.max(this.height - this.lines.length, 0);
      let padTop;
      switch (this.vAlign) {
        case "center":
          padTop = Math.ceil(padLen / 2);
          break;
        case "bottom":
          padTop = padLen;
          break;
        default:
          padTop = 0;
      }
      if (lineNum < padTop || lineNum >= padTop + this.lines.length) {
        return this.drawEmpty(this.drawRight, spanningCell);
      }
      let forceTruncation = this.lines.length > this.height && lineNum + 1 >= this.height;
      return this.drawLine(lineNum - padTop, this.drawRight, forceTruncation, spanningCell);
    }
    drawTop(drawRight) {
      let content = [];
      if (this.cells) {
        this.widths.forEach(function(width, index) {
          content.push(this._topLeftChar(index));
          content.push(utils.repeat(this.chars[this.y == 0 ? "top" : "mid"], width));
        }, this);
      } else {
        content.push(this._topLeftChar(0));
        content.push(utils.repeat(this.chars[this.y == 0 ? "top" : "mid"], this.width));
      }
      if (drawRight) {
        content.push(this.chars[this.y == 0 ? "topRight" : "rightMid"]);
      }
      return this.wrapWithStyleColors("border", content.join(""));
    }
    _topLeftChar(offset) {
      let x = this.x + offset;
      let leftChar;
      if (this.y == 0) {
        leftChar = x == 0 ? "topLeft" : offset == 0 ? "topMid" : "top";
      } else {
        if (x == 0) {
          leftChar = "leftMid";
        } else {
          leftChar = offset == 0 ? "midMid" : "bottomMid";
          if (this.cells) {
            let spanAbove = this.cells[this.y - 1][x] instanceof Cell.ColSpanCell;
            if (spanAbove) {
              leftChar = offset == 0 ? "topMid" : "mid";
            }
            if (offset == 0) {
              let i = 1;
              while (this.cells[this.y][x - i] instanceof Cell.ColSpanCell) {
                i++;
              }
              if (this.cells[this.y][x - i] instanceof Cell.RowSpanCell) {
                leftChar = "leftMid";
              }
            }
          }
        }
      }
      return this.chars[leftChar];
    }
    wrapWithStyleColors(styleProperty, content) {
      if (this[styleProperty] && this[styleProperty].length) {
        try {
          let colors = require_safe();
          for (let i = this[styleProperty].length - 1;i >= 0; i--) {
            colors = colors[this[styleProperty][i]];
          }
          return colors(content);
        } catch (e) {
          return content;
        }
      } else {
        return content;
      }
    }
    drawLine(lineNum, drawRight, forceTruncationSymbol, spanningCell) {
      let left = this.chars[this.x == 0 ? "left" : "middle"];
      if (this.x && spanningCell && this.cells) {
        let cellLeft = this.cells[this.y + spanningCell][this.x - 1];
        while (cellLeft instanceof ColSpanCell) {
          cellLeft = this.cells[cellLeft.y][cellLeft.x - 1];
        }
        if (!(cellLeft instanceof RowSpanCell)) {
          left = this.chars["rightMid"];
        }
      }
      let leftPadding = utils.repeat(" ", this.paddingLeft);
      let right = drawRight ? this.chars["right"] : "";
      let rightPadding = utils.repeat(" ", this.paddingRight);
      let line = this.lines[lineNum];
      let len = this.width - (this.paddingLeft + this.paddingRight);
      if (forceTruncationSymbol)
        line += this.truncate || "\u2026";
      let content = utils.truncate(line, len, this.truncate);
      content = utils.pad(content, len, " ", this.hAlign);
      content = leftPadding + content + rightPadding;
      return this.stylizeLine(left, content, right);
    }
    stylizeLine(left, content, right) {
      left = this.wrapWithStyleColors("border", left);
      right = this.wrapWithStyleColors("border", right);
      if (this.y === 0) {
        content = this.wrapWithStyleColors("head", content);
      }
      return left + content + right;
    }
    drawBottom(drawRight) {
      let left = this.chars[this.x == 0 ? "bottomLeft" : "bottomMid"];
      let content = utils.repeat(this.chars.bottom, this.width);
      let right = drawRight ? this.chars["bottomRight"] : "";
      return this.wrapWithStyleColors("border", left + content + right);
    }
    drawEmpty(drawRight, spanningCell) {
      let left = this.chars[this.x == 0 ? "left" : "middle"];
      if (this.x && spanningCell && this.cells) {
        let cellLeft = this.cells[this.y + spanningCell][this.x - 1];
        while (cellLeft instanceof ColSpanCell) {
          cellLeft = this.cells[cellLeft.y][cellLeft.x - 1];
        }
        if (!(cellLeft instanceof RowSpanCell)) {
          left = this.chars["rightMid"];
        }
      }
      let right = drawRight ? this.chars["right"] : "";
      let content = utils.repeat(" ", this.width);
      return this.stylizeLine(left, content, right);
    }
  }

  class ColSpanCell {
    constructor() {}
    draw(lineNum) {
      if (typeof lineNum === "number") {
        debug(`${this.y}-${this.x}: 1x1 ColSpanCell`);
      }
      return "";
    }
    init() {}
    mergeTableOptions() {}
  }

  class RowSpanCell {
    constructor(originalCell) {
      this.originalCell = originalCell;
    }
    init(tableOptions) {
      let y = this.y;
      let originalY = this.originalCell.y;
      this.cellOffset = y - originalY;
      this.offset = findDimension(tableOptions.rowHeights, originalY, this.cellOffset);
    }
    draw(lineNum) {
      if (lineNum == "top") {
        return this.originalCell.draw(this.offset, this.cellOffset);
      }
      if (lineNum == "bottom") {
        return this.originalCell.draw("bottom");
      }
      debug(`${this.y}-${this.x}: 1x${this.colSpan} RowSpanCell for ${this.originalCell.content}`);
      return this.originalCell.draw(this.offset + 1 + lineNum);
    }
    mergeTableOptions() {}
  }
  function firstDefined(...args) {
    return args.filter((v) => v !== undefined && v !== null).shift();
  }
  function setOption(objA, objB, nameB, targetObj) {
    let nameA = nameB.split("-");
    if (nameA.length > 1) {
      nameA[1] = nameA[1].charAt(0).toUpperCase() + nameA[1].substr(1);
      nameA = nameA.join("");
      targetObj[nameA] = firstDefined(objA[nameA], objA[nameB], objB[nameA], objB[nameB]);
    } else {
      targetObj[nameB] = firstDefined(objA[nameB], objB[nameB]);
    }
  }
  function findDimension(dimensionTable, startingIndex, span) {
    let ret = dimensionTable[startingIndex];
    for (let i = 1;i < span; i++) {
      ret += 1 + dimensionTable[startingIndex + i];
    }
    return ret;
  }
  function sumPlusOne(a, b) {
    return a + b + 1;
  }
  var CHAR_NAMES = [
    "top",
    "top-mid",
    "top-left",
    "top-right",
    "bottom",
    "bottom-mid",
    "bottom-left",
    "bottom-right",
    "left",
    "left-mid",
    "mid",
    "mid-mid",
    "right",
    "right-mid",
    "middle"
  ];
  module.exports = Cell;
  module.exports.ColSpanCell = ColSpanCell;
  module.exports.RowSpanCell = RowSpanCell;
});

// node_modules/cli-table3/src/layout-manager.js
var require_layout_manager = __commonJS((exports, module) => {
  var { warn, debug } = require_debug();
  var Cell = require_cell();
  var { ColSpanCell, RowSpanCell } = Cell;
  (function() {
    function next(alloc, col) {
      if (alloc[col] > 0) {
        return next(alloc, col + 1);
      }
      return col;
    }
    function layoutTable(table) {
      let alloc = {};
      table.forEach(function(row, rowIndex) {
        let col = 0;
        row.forEach(function(cell) {
          cell.y = rowIndex;
          cell.x = rowIndex ? next(alloc, col) : col;
          const rowSpan = cell.rowSpan || 1;
          const colSpan = cell.colSpan || 1;
          if (rowSpan > 1) {
            for (let cs = 0;cs < colSpan; cs++) {
              alloc[cell.x + cs] = rowSpan;
            }
          }
          col = cell.x + colSpan;
        });
        Object.keys(alloc).forEach((idx) => {
          alloc[idx]--;
          if (alloc[idx] < 1)
            delete alloc[idx];
        });
      });
    }
    function maxWidth(table) {
      let mw = 0;
      table.forEach(function(row) {
        row.forEach(function(cell) {
          mw = Math.max(mw, cell.x + (cell.colSpan || 1));
        });
      });
      return mw;
    }
    function maxHeight(table) {
      return table.length;
    }
    function cellsConflict(cell1, cell2) {
      let yMin1 = cell1.y;
      let yMax1 = cell1.y - 1 + (cell1.rowSpan || 1);
      let yMin2 = cell2.y;
      let yMax2 = cell2.y - 1 + (cell2.rowSpan || 1);
      let yConflict = !(yMin1 > yMax2 || yMin2 > yMax1);
      let xMin1 = cell1.x;
      let xMax1 = cell1.x - 1 + (cell1.colSpan || 1);
      let xMin2 = cell2.x;
      let xMax2 = cell2.x - 1 + (cell2.colSpan || 1);
      let xConflict = !(xMin1 > xMax2 || xMin2 > xMax1);
      return yConflict && xConflict;
    }
    function conflictExists(rows, x, y) {
      let i_max = Math.min(rows.length - 1, y);
      let cell = { x, y };
      for (let i = 0;i <= i_max; i++) {
        let row = rows[i];
        for (let j = 0;j < row.length; j++) {
          if (cellsConflict(cell, row[j])) {
            return true;
          }
        }
      }
      return false;
    }
    function allBlank(rows, y, xMin, xMax) {
      for (let x = xMin;x < xMax; x++) {
        if (conflictExists(rows, x, y)) {
          return false;
        }
      }
      return true;
    }
    function addRowSpanCells(table) {
      table.forEach(function(row, rowIndex) {
        row.forEach(function(cell) {
          for (let i = 1;i < cell.rowSpan; i++) {
            let rowSpanCell = new RowSpanCell(cell);
            rowSpanCell.x = cell.x;
            rowSpanCell.y = cell.y + i;
            rowSpanCell.colSpan = cell.colSpan;
            insertCell(rowSpanCell, table[rowIndex + i]);
          }
        });
      });
    }
    function addColSpanCells(cellRows) {
      for (let rowIndex = cellRows.length - 1;rowIndex >= 0; rowIndex--) {
        let cellColumns = cellRows[rowIndex];
        for (let columnIndex = 0;columnIndex < cellColumns.length; columnIndex++) {
          let cell = cellColumns[columnIndex];
          for (let k = 1;k < cell.colSpan; k++) {
            let colSpanCell = new ColSpanCell;
            colSpanCell.x = cell.x + k;
            colSpanCell.y = cell.y;
            cellColumns.splice(columnIndex + 1, 0, colSpanCell);
          }
        }
      }
    }
    function insertCell(cell, row) {
      let x = 0;
      while (x < row.length && row[x].x < cell.x) {
        x++;
      }
      row.splice(x, 0, cell);
    }
    function fillInTable(table) {
      let h_max = maxHeight(table);
      let w_max = maxWidth(table);
      debug(`Max rows: ${h_max}; Max cols: ${w_max}`);
      for (let y = 0;y < h_max; y++) {
        for (let x = 0;x < w_max; x++) {
          if (!conflictExists(table, x, y)) {
            let opts = { x, y, colSpan: 1, rowSpan: 1 };
            x++;
            while (x < w_max && !conflictExists(table, x, y)) {
              opts.colSpan++;
              x++;
            }
            let y2 = y + 1;
            while (y2 < h_max && allBlank(table, y2, opts.x, opts.x + opts.colSpan)) {
              opts.rowSpan++;
              y2++;
            }
            let cell = new Cell(opts);
            cell.x = opts.x;
            cell.y = opts.y;
            warn(`Missing cell at ${cell.y}-${cell.x}.`);
            insertCell(cell, table[y]);
          }
        }
      }
    }
    function generateCells(rows) {
      return rows.map(function(row) {
        if (!Array.isArray(row)) {
          let key = Object.keys(row)[0];
          row = row[key];
          if (Array.isArray(row)) {
            row = row.slice();
            row.unshift(key);
          } else {
            row = [key, row];
          }
        }
        return row.map(function(cell) {
          return new Cell(cell);
        });
      });
    }
    function makeTableLayout(rows) {
      let cellRows = generateCells(rows);
      layoutTable(cellRows);
      fillInTable(cellRows);
      addRowSpanCells(cellRows);
      addColSpanCells(cellRows);
      return cellRows;
    }
    module.exports = {
      makeTableLayout,
      layoutTable,
      addRowSpanCells,
      maxWidth,
      fillInTable,
      computeWidths: makeComputeWidths("colSpan", "desiredWidth", "x", 1),
      computeHeights: makeComputeWidths("rowSpan", "desiredHeight", "y", 1)
    };
  })();
  function makeComputeWidths(colSpan, desiredWidth, x, forcedMin) {
    return function(vals, table) {
      let result = [];
      let spanners = [];
      let auto = {};
      table.forEach(function(row) {
        row.forEach(function(cell) {
          if ((cell[colSpan] || 1) > 1) {
            spanners.push(cell);
          } else {
            result[cell[x]] = Math.max(result[cell[x]] || 0, cell[desiredWidth] || 0, forcedMin);
          }
        });
      });
      vals.forEach(function(val, index) {
        if (typeof val === "number") {
          result[index] = val;
        }
      });
      for (let k = spanners.length - 1;k >= 0; k--) {
        let cell = spanners[k];
        let span = cell[colSpan];
        let col = cell[x];
        let existingWidth = result[col];
        let editableCols = typeof vals[col] === "number" ? 0 : 1;
        if (typeof existingWidth === "number") {
          for (let i = 1;i < span; i++) {
            existingWidth += 1 + result[col + i];
            if (typeof vals[col + i] !== "number") {
              editableCols++;
            }
          }
        } else {
          existingWidth = desiredWidth === "desiredWidth" ? cell.desiredWidth - 1 : 1;
          if (!auto[col] || auto[col] < existingWidth) {
            auto[col] = existingWidth;
          }
        }
        if (cell[desiredWidth] > existingWidth) {
          let i = 0;
          while (editableCols > 0 && cell[desiredWidth] > existingWidth) {
            if (typeof vals[col + i] !== "number") {
              let dif = Math.round((cell[desiredWidth] - existingWidth) / editableCols);
              existingWidth += dif;
              result[col + i] += dif;
              editableCols--;
            }
            i++;
          }
        }
      }
      Object.assign(vals, result, auto);
      for (let j = 0;j < vals.length; j++) {
        vals[j] = Math.max(forcedMin, vals[j] || 0);
      }
    };
  }
});

// node_modules/cli-table3/src/table.js
var require_table = __commonJS((exports, module) => {
  var debug = require_debug();
  var utils = require_utils();
  var tableLayout = require_layout_manager();

  class Table extends Array {
    constructor(opts) {
      super();
      const options = utils.mergeOptions(opts);
      Object.defineProperty(this, "options", {
        value: options,
        enumerable: options.debug
      });
      if (options.debug) {
        switch (typeof options.debug) {
          case "boolean":
            debug.setDebugLevel(debug.WARN);
            break;
          case "number":
            debug.setDebugLevel(options.debug);
            break;
          case "string":
            debug.setDebugLevel(parseInt(options.debug, 10));
            break;
          default:
            debug.setDebugLevel(debug.WARN);
            debug.warn(`Debug option is expected to be boolean, number, or string. Received a ${typeof options.debug}`);
        }
        Object.defineProperty(this, "messages", {
          get() {
            return debug.debugMessages();
          }
        });
      }
    }
    toString() {
      let array = this;
      let headersPresent = this.options.head && this.options.head.length;
      if (headersPresent) {
        array = [this.options.head];
        if (this.length) {
          array.push.apply(array, this);
        }
      } else {
        this.options.style.head = [];
      }
      let cells = tableLayout.makeTableLayout(array);
      cells.forEach(function(row) {
        row.forEach(function(cell) {
          cell.mergeTableOptions(this.options, cells);
        }, this);
      }, this);
      tableLayout.computeWidths(this.options.colWidths, cells);
      tableLayout.computeHeights(this.options.rowHeights, cells);
      cells.forEach(function(row) {
        row.forEach(function(cell) {
          cell.init(this.options);
        }, this);
      }, this);
      let result = [];
      for (let rowIndex = 0;rowIndex < cells.length; rowIndex++) {
        let row = cells[rowIndex];
        let heightOfRow = this.options.rowHeights[rowIndex];
        if (rowIndex === 0 || !this.options.style.compact || rowIndex == 1 && headersPresent) {
          doDraw(row, "top", result);
        }
        for (let lineNum = 0;lineNum < heightOfRow; lineNum++) {
          doDraw(row, lineNum, result);
        }
        if (rowIndex + 1 == cells.length) {
          doDraw(row, "bottom", result);
        }
      }
      return result.join(`
`);
    }
    get width() {
      let str = this.toString().split(`
`);
      return str[0].length;
    }
  }
  Table.reset = () => debug.reset();
  function doDraw(row, lineNum, result) {
    let line = [];
    row.forEach(function(cell) {
      line.push(cell.draw(lineNum));
    });
    let str = line.join("");
    if (str.length)
      result.push(str);
  }
  module.exports = Table;
});

// src/metrics/estimator.ts
function estimateConversationMetrics(input) {
  const { pbFileBytes, brainFolderBytes, messageCount, resolvedVersionCount, bytesPerToken } = input;
  const messageBasedPromptTokens = messageCount !== null ? messageCount * AVG_TOKENS_PER_MESSAGE : 0;
  const pbBasedPromptTokens = Math.floor(pbFileBytes / bytesPerToken);
  const estimatedPromptTokens = messageCount !== null && messageBasedPromptTokens > 0 ? messageBasedPromptTokens : pbBasedPromptTokens;
  const artifactFromBrain = Math.floor(brainFolderBytes / BRAIN_BYTES_PER_TOKEN);
  const artifactFromResolvedVersions = resolvedVersionCount * TOKENS_PER_RESOLVED_VERSION;
  const estimatedArtifactTokens = artifactFromBrain + artifactFromResolvedVersions;
  return {
    estimatedPromptTokens,
    estimatedArtifactTokens,
    estimatedTotalTokens: estimatedPromptTokens + estimatedArtifactTokens,
    promptEstimateSource: messageCount !== null && messageBasedPromptTokens > 0 ? "message_count" : "pb_size"
  };
}
function explainWhyHeavy(estimatedPromptTokens, estimatedArtifactTokens, estimatedTotalTokens, bloatLimit) {
  if (estimatedTotalTokens === 0) {
    return "No estimated context recorded yet.";
  }
  const ratio = estimatedTotalTokens / bloatLimit;
  const artifactShare = estimatedArtifactTokens / estimatedTotalTokens;
  if (ratio >= 1 && artifactShare >= 0.35) {
    return "Estimated total is over the limit and artifact context is a material share of it.";
  }
  if (ratio >= 1) {
    return "Estimated conversation history is already over the configured context limit.";
  }
  if (artifactShare >= 0.45) {
    return "Artifact context is a large share of the estimated total.";
  }
  if (ratio >= 0.8) {
    return "Estimated conversation history is close to the configured context limit.";
  }
  return "Estimated conversation history is the dominant source of context growth.";
}
function formatBytes(bytes) {
  if (bytes === 0)
    return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, unitIndex);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unitIndex]}`;
}
function formatTokens(tokens) {
  if (tokens >= 1e6)
    return `${(tokens / 1e6).toFixed(1)}M`;
  if (tokens >= 1000)
    return `${(tokens / 1000).toFixed(0)}K`;
  return `${tokens}`;
}
function formatRatio(ratio) {
  return `${Math.round(ratio * 100)}%`;
}
var AVG_TOKENS_PER_MESSAGE = 1500, BRAIN_BYTES_PER_TOKEN = 4, TOKENS_PER_RESOLVED_VERSION = 500;

// src/metrics/snapshotter.ts
function takeSnapshotIfChanged(db, conversation) {
  const lastSnapshot = db.getLatestSnapshot(conversation.id);
  const now = new Date().toISOString();
  const previousBytes = lastSnapshot?.pb_file_bytes ?? 0;
  const previousTokens = lastSnapshot?.estimated_tokens ?? 0;
  const deltaBytes = conversation.pb_file_bytes - previousBytes;
  const deltaTokens = conversation.estimated_tokens - previousTokens;
  const deltaMessages = lastSnapshot && conversation.message_count !== null && lastSnapshot.message_count !== null ? conversation.message_count - lastSnapshot.message_count : null;
  const changed = lastSnapshot === null || deltaBytes !== 0 || deltaTokens !== 0 || deltaMessages !== null;
  if (changed) {
    db.insertSnapshot({
      conversation_id: conversation.id,
      timestamp: now,
      pb_file_bytes: conversation.pb_file_bytes,
      estimated_tokens: conversation.estimated_tokens,
      message_count: conversation.message_count,
      delta_bytes: deltaBytes
    });
  }
  return {
    conversationId: conversation.id,
    deltaBytes,
    deltaTokens,
    deltaMessages,
    previousSnapshot: lastSnapshot,
    isNew: lastSnapshot === null,
    changed
  };
}
function getLatestDeltaTokens(db, conversationId) {
  const snapshots = db.getSnapshotHistory(conversationId, 2);
  if (snapshots.length < 2) {
    return 0;
  }
  return (snapshots[0].estimated_tokens || 0) - (snapshots[1].estimated_tokens || 0);
}

// src/runtime/log-signals.ts
import { existsSync as existsSync8, readFileSync as readFileSync6, readdirSync as readdirSync4 } from "fs";
import { join as join6 } from "path";
function findLatestLogFile() {
  const logDir = getLogDir();
  if (!existsSync8(logDir))
    return null;
  try {
    const dateDirs = readdirSync4(logDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => ({
      name: entry.name,
      path: join6(logDir, entry.name)
    })).sort((left, right) => right.name.localeCompare(left.name));
    for (const dateDir of dateDirs) {
      const found = findLogFileRecursive(dateDir.path);
      if (found)
        return found;
    }
  } catch {
    return null;
  }
  return null;
}
function findLogFileRecursive(dir) {
  try {
    const entries = readdirSync4(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join6(dir, entry.name);
      if (entry.isFile() && entry.name === "Antigravity.log") {
        return fullPath;
      }
      if (entry.isDirectory()) {
        const nested = findLogFileRecursive(fullPath);
        if (nested)
          return nested;
      }
    }
  } catch {
    return null;
  }
  return null;
}
function parseLogLine(line) {
  const timestampMatch = line.match(TIMESTAMP_REGEX);
  const timestamp = timestampMatch ? timestampMatch[1] : null;
  const messageMatch = line.match(/planner_generator\.go:\d+\]\s*Requesting planner with (\d+) chat messages/i);
  if (messageMatch) {
    return {
      type: "message_count",
      value: parseInt(messageMatch[1], 10),
      timestamp,
      raw: line
    };
  }
  const conversationMatch = line.match(/interceptor\.go:\d+\].*?conversation\s+([0-9a-f-]{36})/i) ?? line.match(CONVERSATION_REGEX);
  if (conversationMatch) {
    return {
      type: "conversation_id",
      value: conversationMatch[1],
      timestamp,
      raw: line
    };
  }
  if (/http_helpers\.go:\d+\]/i.test(line)) {
    return {
      type: "api_call",
      value: "active",
      timestamp,
      raw: line
    };
  }
  return null;
}
function scanLogText(text, filePath = null) {
  const messageCounts = new Map;
  const lastActivityAt = new Map;
  let activeConversationId = null;
  let activeAt = null;
  let currentConversationId = null;
  let linesParsed = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim())
      continue;
    linesParsed++;
    const parsed = parseLogLine(line);
    if (!parsed)
      continue;
    if (parsed.type === "conversation_id") {
      currentConversationId = String(parsed.value);
      activeConversationId = currentConversationId;
      activeAt = parsed.timestamp;
      if (parsed.timestamp) {
        lastActivityAt.set(currentConversationId, parsed.timestamp);
      }
      continue;
    }
    if (parsed.type === "message_count" && currentConversationId) {
      const count = parsed.value;
      messageCounts.set(currentConversationId, count);
      if (parsed.timestamp) {
        lastActivityAt.set(currentConversationId, parsed.timestamp);
        activeConversationId = currentConversationId;
        activeAt = parsed.timestamp;
      }
    }
  }
  return {
    logFilePath: filePath,
    activeConversationId,
    activeAt,
    messageCounts,
    lastActivityAt,
    linesParsed
  };
}
function scanLogFile(filePath) {
  const text = readFileSync6(filePath, "utf-8");
  return scanLogText(text, filePath);
}
function scanLatestLogFile() {
  const logFilePath = findLatestLogFile();
  if (!logFilePath) {
    return {
      logFilePath: null,
      activeConversationId: null,
      activeAt: null,
      messageCounts: new Map,
      lastActivityAt: new Map,
      linesParsed: 0
    };
  }
  try {
    return scanLogFile(logFilePath);
  } catch {
    return {
      logFilePath,
      activeConversationId: null,
      activeAt: null,
      messageCounts: new Map,
      lastActivityAt: new Map,
      linesParsed: 0
    };
  }
}
var TIMESTAMP_REGEX, CONVERSATION_REGEX;
var init_log_signals = __esm(() => {
  init_paths();
  TIMESTAMP_REGEX = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})/;
  CONVERSATION_REGEX = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
});

// src/watcher/file-watcher.ts
var exports_file_watcher = {};
__export(exports_file_watcher, {
  startFileWatcher: () => startFileWatcher
});
import { existsSync as existsSync9, statSync as statSync3, watch } from "fs";
import { basename as basename2, extname as extname2, join as join7 } from "path";
function startFileWatcher(db, config) {
  const conversationsDir = getConversationsDir();
  if (!existsSync9(conversationsDir)) {
    console.warn(source_default.yellow(`\u26A0\uFE0F  Cannot watch \u2014 conversations directory not found: ${conversationsDir}`));
    return;
  }
  const debounceTimers = new Map;
  try {
    const watcher = watch(conversationsDir, (_eventType, filename) => {
      if (!filename || extname2(filename) !== ".pb")
        return;
      const existing = debounceTimers.get(filename);
      if (existing)
        clearTimeout(existing);
      debounceTimers.set(filename, setTimeout(() => {
        debounceTimers.delete(filename);
        handlePbChange(db, config, conversationsDir, filename);
      }, DEBOUNCE_MS));
    });
    watcher.on("error", (err) => {
      console.error(source_default.red("\u274C File watcher error:"), err.message);
    });
    console.log(source_default.dim(`   Watching: ${conversationsDir}`));
  } catch (err) {
    console.error(source_default.red("\u274C Failed to start file watcher:"), err);
  }
}
function handlePbChange(db, config, conversationsDir, filename) {
  const filePath = join7(conversationsDir, filename);
  const conversationId = basename2(filename, ".pb");
  try {
    if (!existsSync9(filePath)) {
      const timestamp2 = new Date().toLocaleTimeString();
      console.log(source_default.dim(`[${timestamp2}]`) + source_default.red(` ${conversationId.slice(0, 12)}... deleted`));
      return;
    }
    const conversation = db.getConversation(conversationId);
    if (!conversation) {
      return;
    }
    const currentBytes = statSync3(filePath).size;
    const deltaBytes = currentBytes - conversation.pb_file_bytes;
    if (deltaBytes === 0) {
      return;
    }
    const metrics = estimateConversationMetrics({
      pbFileBytes: currentBytes,
      brainFolderBytes: conversation.brain_folder_bytes,
      messageCount: conversation.message_count,
      resolvedVersionCount: conversation.resolved_version_count,
      bytesPerToken: config.bytesPerToken
    });
    const updatedConversation = {
      ...conversation,
      pb_file_bytes: currentBytes,
      estimated_prompt_tokens: metrics.estimatedPromptTokens,
      estimated_artifact_tokens: metrics.estimatedArtifactTokens,
      estimated_tokens: metrics.estimatedTotalTokens,
      last_modified: new Date().toISOString()
    };
    db.upsertConversation(updatedConversation);
    const snapshot = takeSnapshotIfChanged(db, updatedConversation);
    if (updatedConversation.workspace_id) {
      db.updateWorkspaceAggregates(updatedConversation.workspace_id);
    }
    const timestamp = new Date().toLocaleTimeString();
    const ratio = config.bloatLimit > 0 ? updatedConversation.estimated_tokens / config.bloatLimit : 0;
    const title = updatedConversation.title ? ` ${source_default.dim(`"${updatedConversation.title}"`)}` : "";
    console.log(source_default.dim(`[${timestamp}]`) + ` ${updatedConversation.id.slice(0, 12)}...${title}` + ` ${deltaBytes >= 0 ? "+" : "-"}${formatBytes(Math.abs(deltaBytes))}` + ` (${snapshot.deltaTokens >= 0 ? "+" : "-"}${formatTokens(Math.abs(snapshot.deltaTokens))} est. tokens)` + ` \u2192 ${formatTokens(updatedConversation.estimated_tokens)} estimated total` + ` (${formatRatio(ratio)} of limit)`);
  } catch {}
}
var DEBOUNCE_MS = 500;
var init_file_watcher = __esm(() => {
  init_source();
  init_paths();
});

// src/watcher/log-tailer.ts
var exports_log_tailer = {};
__export(exports_log_tailer, {
  startLogTailer: () => startLogTailer
});
import { existsSync as existsSync10, readFileSync as readFileSync7, statSync as statSync4, watchFile } from "fs";
function startLogTailer(db, config) {
  const logFilePath = findLatestLogFile();
  if (!logFilePath || !existsSync10(logFilePath)) {
    console.log(source_default.dim("   Log tailer: no Antigravity.log found"));
    return;
  }
  console.log(source_default.dim(`   Tailing: ${logFilePath}`));
  const state = {
    filePath: logFilePath,
    offset: statSync4(logFilePath).size,
    currentConversationId: null
  };
  watchFile(logFilePath, { interval: 1000 }, () => {
    processNewLines(db, config, state);
  });
}
function processNewLines(db, config, state) {
  try {
    const stats = statSync4(state.filePath);
    if (stats.size < state.offset) {
      state.offset = 0;
    }
    if (stats.size <= state.offset) {
      return;
    }
    const content = readFileSync7(state.filePath, "utf-8");
    const newContent = content.slice(state.offset);
    state.offset = stats.size;
    for (const line of newContent.split(/\r?\n/)) {
      if (!line.trim())
        continue;
      const parsed = parseLogLine(line);
      if (!parsed)
        continue;
      if (parsed.type === "conversation_id") {
        state.currentConversationId = String(parsed.value);
        continue;
      }
      if (parsed.type !== "message_count" || !state.currentConversationId) {
        continue;
      }
      const conversation = db.getConversation(state.currentConversationId);
      if (!conversation) {
        continue;
      }
      const newCount = parsed.value;
      const metrics = estimateConversationMetrics({
        pbFileBytes: conversation.pb_file_bytes,
        brainFolderBytes: conversation.brain_folder_bytes,
        messageCount: newCount,
        resolvedVersionCount: conversation.resolved_version_count,
        bytesPerToken: config.bytesPerToken
      });
      const updatedConversation = {
        ...conversation,
        message_count: newCount,
        message_count_source: "log",
        estimated_prompt_tokens: metrics.estimatedPromptTokens,
        estimated_artifact_tokens: metrics.estimatedArtifactTokens,
        estimated_tokens: metrics.estimatedTotalTokens,
        last_active_at: parsed.timestamp ? new Date(parsed.timestamp.replace(" ", "T")).toISOString() : conversation.last_active_at,
        activity_source: "log",
        is_active: 1
      };
      db.clearActiveConversation();
      db.upsertConversation(updatedConversation);
      takeSnapshotIfChanged(db, updatedConversation);
      if (updatedConversation.workspace_id) {
        db.updateWorkspaceAggregates(updatedConversation.workspace_id);
      }
      const deltaMessages = conversation.message_count !== null ? newCount - conversation.message_count : null;
      const ratio = config.bloatLimit > 0 ? updatedConversation.estimated_tokens / config.bloatLimit : 0;
      const timestamp = new Date().toLocaleTimeString();
      const deltaLabel = deltaMessages !== null ? ` (+${deltaMessages} since last)` : "";
      const title = updatedConversation.title ? ` ${source_default.dim(`"${updatedConversation.title}"`)}` : "";
      console.log(source_default.dim(`[${timestamp}]`) + source_default.magenta(" [LIVE]") + ` ${updatedConversation.id.slice(0, 12)}...${title}` + ` now at ${source_default.bold(String(newCount))} direct messages${deltaLabel}` + ` \u2192 ${formatTokens(updatedConversation.estimated_tokens)} estimated tokens` + ` (${formatRatio(ratio)} of limit)`);
    }
  } catch {}
}
var init_log_tailer = __esm(() => {
  init_source();
  init_log_signals();
});

// node_modules/commander/esm.mjs
var import__ = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  Command,
  Argument,
  Option,
  Help
} = import__.default;

// src/config.ts
init_paths();
import { existsSync, readFileSync } from "fs";
import { homedir as homedir2 } from "os";
import { join as join2, resolve } from "path";
var CONFIG_FILE_NAME = ".ag-kernel.json";
var DEFAULTS = {
  bloatLimit: 1e6,
  bytesPerToken: 3.5,
  dbPath: getDefaultDbPath(),
  logLevel: "info"
};
function findConfigFile(explicitPath) {
  if (explicitPath) {
    const resolvedExplicit = resolve(explicitPath);
    return existsSync(resolvedExplicit) ? resolvedExplicit : null;
  }
  const projectPath = resolve(process.cwd(), CONFIG_FILE_NAME);
  if (existsSync(projectPath))
    return projectPath;
  const homePath = join2(homedir2(), CONFIG_FILE_NAME);
  if (existsSync(homePath))
    return homePath;
  return null;
}
function loadConfig(explicitPath) {
  const configPath = findConfigFile(explicitPath);
  if (!configPath) {
    return { ...DEFAULTS };
  }
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      bloatLimit: typeof parsed.bloatLimit === "number" ? parsed.bloatLimit : DEFAULTS.bloatLimit,
      bytesPerToken: typeof parsed.bytesPerToken === "number" ? parsed.bytesPerToken : DEFAULTS.bytesPerToken,
      dbPath: typeof parsed.dbPath === "string" ? resolveDbPath(parsed.dbPath) : DEFAULTS.dbPath,
      logLevel: isValidLogLevel(parsed.logLevel) ? parsed.logLevel : DEFAULTS.logLevel
    };
  } catch {
    console.warn(`Warning: failed to parse ${configPath}, using defaults`);
    return { ...DEFAULTS };
  }
}
function resolveDbPath(p) {
  if (p.startsWith("~")) {
    return join2(homedir2(), p.slice(1));
  }
  return resolve(p);
}
function isValidLogLevel(level) {
  return typeof level === "string" && ["debug", "info", "warn", "error"].includes(level);
}

// src/db/schema.ts
import { Database } from "bun:sqlite";
import { existsSync as existsSync2, mkdirSync } from "fs";
import { dirname } from "path";
var SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    uri TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    total_pb_bytes INTEGER DEFAULT 0,
    total_brain_bytes INTEGER DEFAULT 0,
    conversation_count INTEGER DEFAULT 0,
    last_seen TEXT
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    title TEXT,
    pb_file_bytes INTEGER DEFAULT 0,
    brain_folder_bytes INTEGER DEFAULT 0,
    brain_artifact_count INTEGER DEFAULT 0,
    resolved_version_count INTEGER DEFAULT 0,
    message_count INTEGER,
    message_count_source TEXT,
    estimated_prompt_tokens INTEGER DEFAULT 0,
    estimated_artifact_tokens INTEGER DEFAULT 0,
    estimated_tokens INTEGER DEFAULT 0,
    annotation_timestamp INTEGER,
    created_at TEXT,
    last_modified TEXT,
    last_active_at TEXT,
    activity_source TEXT,
    mapping_source TEXT,
    mapping_confidence REAL,
    mapping_notes TEXT,
    is_active INTEGER DEFAULT 0,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    pb_file_bytes INTEGER,
    estimated_tokens INTEGER,
    message_count INTEGER,
    delta_bytes INTEGER,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_workspace
    ON conversations(workspace_id);

  CREATE INDEX IF NOT EXISTS idx_snapshots_conversation
    ON snapshots(conversation_id);

  CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp
    ON snapshots(timestamp);
`;

class MonitorDB {
  db;
  constructor(dbPath) {
    const dir = dirname(dbPath);
    if (!existsSync2(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.init();
  }
  init() {
    this.db.exec(SCHEMA_SQL);
    this.ensureColumn("conversations", "title", "TEXT");
    this.ensureColumn("conversations", "message_count_source", "TEXT");
    this.ensureColumn("conversations", "estimated_prompt_tokens", "INTEGER DEFAULT 0");
    this.ensureColumn("conversations", "estimated_artifact_tokens", "INTEGER DEFAULT 0");
    this.ensureColumn("conversations", "last_active_at", "TEXT");
    this.ensureColumn("conversations", "activity_source", "TEXT");
    this.ensureColumn("conversations", "mapping_source", "TEXT");
    this.ensureColumn("conversations", "mapping_confidence", "REAL");
    this.ensureColumn("conversations", "mapping_notes", "TEXT");
    this.ensureColumn("conversations", "is_active", "INTEGER DEFAULT 0");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_conversations_active ON conversations(is_active, last_active_at)");
  }
  ensureColumn(table, column, definition) {
    const columns = this.db.query(`PRAGMA table_info(${table})`).all();
    if (columns.some((entry) => entry.name === column)) {
      return;
    }
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  upsertWorkspace(ws) {
    this.db.run(`INSERT INTO workspaces (id, uri, name, last_seen)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(id) DO UPDATE SET
         uri = excluded.uri,
         name = excluded.name,
         last_seen = excluded.last_seen`, [ws.id, ws.uri, ws.name, ws.last_seen]);
  }
  updateWorkspaceAggregates(workspaceId) {
    this.db.run(`UPDATE workspaces SET
         total_pb_bytes = COALESCE((SELECT SUM(pb_file_bytes) FROM conversations WHERE workspace_id = ?1), 0),
         total_brain_bytes = COALESCE((SELECT SUM(brain_folder_bytes) FROM conversations WHERE workspace_id = ?1), 0),
         conversation_count = (SELECT COUNT(*) FROM conversations WHERE workspace_id = ?1)
       WHERE id = ?1`, [workspaceId]);
  }
  getAllWorkspaces() {
    return this.db.query("SELECT * FROM workspaces ORDER BY total_pb_bytes DESC").all();
  }
  getWorkspaceByName(name) {
    return this.db.query("SELECT * FROM workspaces WHERE name = ?1").get(name);
  }
  getWorkspaceById(id) {
    return this.db.query("SELECT * FROM workspaces WHERE id = ?1").get(id);
  }
  upsertConversation(conv) {
    this.db.run(`INSERT INTO conversations (
         id, workspace_id, title, pb_file_bytes, brain_folder_bytes,
         brain_artifact_count, resolved_version_count, message_count,
         message_count_source, estimated_prompt_tokens, estimated_artifact_tokens,
         estimated_tokens, annotation_timestamp, created_at, last_modified,
         last_active_at, activity_source, mapping_source, mapping_confidence, mapping_notes, is_active
       )
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
       ON CONFLICT(id) DO UPDATE SET
         workspace_id = excluded.workspace_id,
         title = excluded.title,
         pb_file_bytes = excluded.pb_file_bytes,
         brain_folder_bytes = excluded.brain_folder_bytes,
         brain_artifact_count = excluded.brain_artifact_count,
         resolved_version_count = excluded.resolved_version_count,
         message_count = excluded.message_count,
         message_count_source = excluded.message_count_source,
         estimated_prompt_tokens = excluded.estimated_prompt_tokens,
         estimated_artifact_tokens = excluded.estimated_artifact_tokens,
         estimated_tokens = excluded.estimated_tokens,
         annotation_timestamp = excluded.annotation_timestamp,
         last_modified = excluded.last_modified,
         last_active_at = excluded.last_active_at,
         activity_source = excluded.activity_source,
         mapping_source = excluded.mapping_source,
         mapping_confidence = excluded.mapping_confidence,
         mapping_notes = excluded.mapping_notes,
         is_active = excluded.is_active`, [
      conv.id,
      conv.workspace_id,
      conv.title,
      conv.pb_file_bytes,
      conv.brain_folder_bytes,
      conv.brain_artifact_count,
      conv.resolved_version_count,
      conv.message_count,
      conv.message_count_source,
      conv.estimated_prompt_tokens,
      conv.estimated_artifact_tokens,
      conv.estimated_tokens,
      conv.annotation_timestamp,
      conv.created_at,
      conv.last_modified,
      conv.last_active_at,
      conv.activity_source,
      conv.mapping_source,
      conv.mapping_confidence,
      conv.mapping_notes,
      conv.is_active
    ]);
  }
  getConversationsByWorkspace(workspaceId) {
    if (workspaceId === null) {
      return this.db.query("SELECT * FROM conversations WHERE workspace_id IS NULL ORDER BY estimated_tokens DESC, pb_file_bytes DESC").all();
    }
    return this.db.query("SELECT * FROM conversations WHERE workspace_id = ?1 ORDER BY estimated_tokens DESC, pb_file_bytes DESC").all(workspaceId);
  }
  getConversation(id) {
    return this.db.query("SELECT * FROM conversations WHERE id = ?1").get(id);
  }
  getAllConversations() {
    return this.db.query("SELECT * FROM conversations ORDER BY estimated_tokens DESC, pb_file_bytes DESC").all();
  }
  getCurrentConversation() {
    return this.db.query(`SELECT * FROM conversations
       ORDER BY is_active DESC, COALESCE(last_active_at, last_modified) DESC, estimated_tokens DESC
       LIMIT 1`).get();
  }
  deleteConversation(id) {
    this.db.run("DELETE FROM snapshots WHERE conversation_id = ?1", [id]);
    this.db.run("DELETE FROM conversations WHERE id = ?1", [id]);
  }
  deleteConversationsByWorkspace(workspaceId) {
    const conversations = this.getConversationsByWorkspace(workspaceId);
    const ids = conversations.map((conversation) => conversation.id);
    for (const id of ids) {
      this.deleteConversation(id);
    }
    return ids;
  }
  deleteConversationsNotIn(ids) {
    const current = this.db.query("SELECT id FROM conversations").all();
    const allowed = new Set(ids);
    const removed = [];
    for (const row of current) {
      if (!allowed.has(row.id)) {
        this.deleteConversation(row.id);
        removed.push(row.id);
      }
    }
    return removed;
  }
  clearActiveConversation() {
    this.db.run("UPDATE conversations SET is_active = 0");
  }
  insertSnapshot(snap) {
    this.db.run(`INSERT INTO snapshots (conversation_id, timestamp, pb_file_bytes, estimated_tokens, message_count, delta_bytes)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`, [
      snap.conversation_id,
      snap.timestamp,
      snap.pb_file_bytes,
      snap.estimated_tokens,
      snap.message_count,
      snap.delta_bytes
    ]);
  }
  getLatestSnapshot(conversationId) {
    return this.db.query("SELECT * FROM snapshots WHERE conversation_id = ?1 ORDER BY timestamp DESC LIMIT 1").get(conversationId);
  }
  getSnapshotHistory(conversationId, limit = 50) {
    return this.db.query("SELECT * FROM snapshots WHERE conversation_id = ?1 ORDER BY timestamp DESC LIMIT ?2").all(conversationId, limit);
  }
  getTotalStats() {
    return this.db.query(`
      SELECT
        COALESCE(SUM(pb_file_bytes), 0) as total_pb_bytes,
        COALESCE(SUM(brain_folder_bytes), 0) as total_brain_bytes,
        COUNT(*) as total_conversations,
        COALESCE(SUM(estimated_tokens), 0) as total_estimated_tokens
      FROM conversations
    `).get();
  }
  close() {
    this.db.close();
  }
  raw() {
    return this.db;
  }
}

// src/cli/commands/scan.ts
init_source();
var import_cli_table3 = __toESM(require_table(), 1);

// src/ingest/storage-json.ts
init_paths();
import { readFileSync as readFileSync2, existsSync as existsSync3 } from "fs";

// src/uri-utils.ts
var WINDOWS_DRIVE_REGEX = /^([a-zA-Z]):[\\/]/;
var FILE_URI_REGEX = /file:\/\/(?:\/(?:[a-zA-Z]:|[a-zA-Z]%3A)|wsl\.localhost\/)[^\s"'<>)\]}]+/gi;
function trimDecorators(input) {
  return input.trim().replace(/^[>\s"'`]+/, "").replace(/[>\s"'`,.;:!?]+$/, "");
}
function collapseSlashes(input) {
  return input.replace(/\/{2,}/g, "/");
}
function normalizeWindowsPath(pathValue) {
  const forward = pathValue.replace(/\\/g, "/");
  return forward.replace(WINDOWS_DRIVE_REGEX, (_, drive) => `${drive.toLowerCase()}:/`);
}
function normalizeFileUriLike(uri) {
  const cleaned = trimDecorators(uri).replace(/\\/g, "/");
  if (/^file:\/\/wsl\.localhost\//i.test(cleaned)) {
    const suffix = cleaned.slice("file://".length);
    const normalized = collapseSlashes(suffix).replace(/^wsl\.localhost/i, "wsl.localhost");
    return `file://${normalized}`.replace(/\/$/, "");
  }
  if (/^file:\/\/\/[a-zA-Z]:/i.test(cleaned)) {
    const suffix = cleaned.slice("file:///".length);
    return `file:///${normalizeWindowsPath(suffix)}`.replace(/\/$/, "");
  }
  return cleaned.replace(/\/$/, "");
}
function toFileUri(pathValue) {
  const normalizedPath = normalizeWindowsPath(pathValue);
  if (WINDOWS_DRIVE_REGEX.test(normalizedPath)) {
    return `file:///${normalizedPath}`.replace(/\/$/, "");
  }
  const unixLike = collapseSlashes(normalizedPath);
  return `file://${unixLike.startsWith("/") ? "" : "/"}${unixLike}`.replace(/\/$/, "");
}
function normalizeWorkspaceUri(uri) {
  if (!uri)
    return null;
  const trimmed = trimDecorators(uri);
  if (!trimmed)
    return null;
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }
  if (/^file:\/\//i.test(decoded)) {
    return normalizeFileUriLike(decoded);
  }
  if (WINDOWS_DRIVE_REGEX.test(decoded)) {
    return toFileUri(decoded);
  }
  return collapseSlashes(decoded.replace(/\\/g, "/")).replace(/\/$/, "");
}
function extractWorkspaceNameFromUri(uri) {
  const normalized = normalizeWorkspaceUri(uri) ?? trimDecorators(uri);
  const withoutScheme = normalized.replace(/^file:\/\/\/?/i, "");
  const parts = withoutScheme.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? normalized;
  return last || normalized;
}
function findFileUrisInText(text) {
  const uris = new Set;
  for (const match of text.matchAll(FILE_URI_REGEX)) {
    const normalized = normalizeWorkspaceUri(match[0]);
    if (normalized) {
      uris.add(normalized);
    }
  }
  return Array.from(uris);
}
function isPlaygroundUri(uri) {
  const normalized = normalizeWorkspaceUri(uri);
  if (!normalized)
    return false;
  return normalized.includes("/.gemini/antigravity/playground/");
}
function uriMatchesWorkspaceRoot(candidate, workspaceRoot) {
  const normalizedCandidate = normalizeWorkspaceUri(candidate);
  const normalizedRoot = normalizeWorkspaceUri(workspaceRoot);
  if (!normalizedCandidate || !normalizedRoot) {
    return false;
  }
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`);
}

// src/ingest/storage-json.ts
function parseStorageJson(customPath) {
  const storagePath = customPath || getStorageJsonPath();
  if (!existsSync3(storagePath)) {
    console.warn(`\u26A0\uFE0F  storage.json not found at: ${storagePath}`);
    return null;
  }
  let raw;
  try {
    const content = readFileSync2(storagePath, "utf-8");
    raw = JSON.parse(content);
  } catch (err) {
    console.error(`\u274C Failed to parse storage.json:`, err);
    return null;
  }
  const workspaces = [];
  const profileAssociations = raw["profileAssociations"];
  if (profileAssociations && typeof profileAssociations === "object") {
    const wsMap = profileAssociations["workspaces"];
    if (wsMap && typeof wsMap === "object") {
      for (const [uri, profileId] of Object.entries(wsMap)) {
        const hash = generateWorkspaceHash(uri);
        const normalizedUri = normalizeWorkspaceUri(uri);
        if (!normalizedUri)
          continue;
        workspaces.push({
          hash,
          uri,
          normalizedUri,
          name: extractWorkspaceNameFromUri(uri)
        });
      }
    }
  }
  const sidebarWorkspaces = [];
  const unifiedState = raw["antigravityUnifiedStateSync"];
  if (unifiedState && typeof unifiedState === "object") {
    const sidebar = unifiedState["sidebarWorkspaces"];
    if (Array.isArray(sidebar)) {
      for (const entry of sidebar) {
        if (entry && typeof entry === "object" && "uri" in entry) {
          sidebarWorkspaces.push({
            uri: String(entry.uri),
            name: extractWorkspaceNameFromUri(String(entry.uri)),
            isActive: Boolean(entry.isActive)
          });
        }
      }
    } else if (typeof sidebar === "string") {
      try {
        const parsed = JSON.parse(sidebar);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            if (entry && typeof entry === "object" && "uri" in entry) {
              sidebarWorkspaces.push({
                uri: String(entry.uri),
                name: extractWorkspaceNameFromUri(String(entry.uri)),
                isActive: Boolean(entry.isActive)
              });
            }
          }
        }
      } catch {}
    }
  }
  const scratchWorkspaces = [];
  if (unifiedState && typeof unifiedState === "object") {
    const scratch = unifiedState["scratchWorkspaces"];
    if (Array.isArray(scratch)) {
      for (const entry of scratch) {
        if (entry && typeof entry === "object" && "uri" in entry) {
          scratchWorkspaces.push({
            uri: String(entry.uri),
            name: extractWorkspaceNameFromUri(String(entry.uri))
          });
        }
      }
    } else if (typeof scratch === "string") {
      try {
        const parsed = JSON.parse(scratch);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            if (entry && typeof entry === "object" && "uri" in entry) {
              scratchWorkspaces.push({
                uri: String(entry.uri),
                name: extractWorkspaceNameFromUri(String(entry.uri))
              });
            }
          }
        }
      } catch {}
    }
  }
  return { workspaces, sidebarWorkspaces, scratchWorkspaces, raw };
}
function generateWorkspaceHash(uri) {
  const hasher = new Bun.CryptoHasher("md5");
  hasher.update(uri);
  return hasher.digest("hex");
}

// src/ingest/state-vscdb.ts
init_paths();
import { Database as Database2 } from "bun:sqlite";
import { existsSync as existsSync4 } from "fs";
var UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig;
var BASE64_REGEX = /(?:[A-Za-z0-9+/]{24,}={0,2})/g;
var TITLE_REGEX = /([A-Z][A-Za-z0-9&/()'.,:_-]*(?: [A-Za-z0-9&/()'.,:_-]+){1,12})/;
function readItemTableRawValue(db, key) {
  try {
    const row = db.query("SELECT value FROM ItemTable WHERE key = ?1").get(key);
    if (!row)
      return null;
    if (typeof row.value === "string")
      return row.value;
    if (Buffer.isBuffer(row.value))
      return row.value.toString("utf-8");
    if (row.value instanceof Uint8Array)
      return new TextDecoder().decode(row.value);
    return null;
  } catch {
    return null;
  }
}
function tryParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function isLikelyBase64(raw) {
  const trimmed = raw.trim();
  return trimmed.length >= 16 && trimmed.length % 4 === 0 && /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed);
}
function toPrintableText(input) {
  return input.replace(/[^\x20-\x7E\r\n\t]+/g, " ");
}
function decodeBase64Printable(candidate) {
  return toPrintableText(Buffer.from(candidate, "base64").toString("utf-8")).trim();
}
function scoreDecodedText(text) {
  let score = 0;
  score += (text.match(/file:\/\/\/|https?:\/\//g) ?? []).length * 20;
  score += (text.match(/[A-Za-z]{4,}/g) ?? []).length;
  if (/\{\".+/.test(text))
    score += 10;
  return score;
}
function sanitizeTitle(title) {
  return title.replace(/^[^A-Za-z0-9]+/, "").replace(/\s+\$?$/, "").replace(/\s+[A-Za-z]$/, "").replace(/\s{2,}/g, " ").trim();
}
function isUsableTitle(title) {
  if (title.length < 6)
    return false;
  if (UUID_REGEX.test(title))
    return false;
  UUID_REGEX.lastIndex = 0;
  if (/notify_user/i.test(title))
    return false;
  if (/^(mainR|masterR)/i.test(title))
    return false;
  if (/tokens truncated/i.test(title))
    return false;
  if (/[{}]/.test(title))
    return false;
  const words = title.match(/[A-Za-z]{3,}/g) ?? [];
  return words.length >= 2;
}
function decodeNestedPayloads(segment) {
  const decoded = [];
  const seen = new Set;
  for (const match of segment.matchAll(BASE64_REGEX)) {
    const candidate = match[0];
    if (candidate.length < 24 || candidate.length > 16000)
      continue;
    try {
      const variants = [candidate];
      if (candidate.length > 25) {
        variants.push(candidate.slice(1));
      }
      let printable = "";
      let bestScore = -1;
      for (const variant of variants) {
        const decoded2 = decodeBase64Printable(variant);
        const score = scoreDecodedText(decoded2);
        if (score > bestScore) {
          printable = decoded2;
          bestScore = score;
        }
      }
      if (!printable || printable.length < 8)
        continue;
      if (!/(file:\/\/\/|https?:\/\/|[A-Za-z]{4,} [A-Za-z]{4,}|\{\".+)/.test(printable))
        continue;
      if (seen.has(printable))
        continue;
      seen.add(printable);
      decoded.push(printable);
    } catch {
      continue;
    }
  }
  return decoded;
}
function extractTitle(segment, nestedPayloads, conversationId) {
  const sources = [...nestedPayloads, toPrintableText(segment)];
  for (const source of sources) {
    const prefix = source.split(conversationId)[0] ?? source;
    const quoteMatch = prefix.match(/"([^"]{6,120})"/);
    if (quoteMatch) {
      const title = sanitizeTitle(quoteMatch[1]);
      if (isUsableTitle(title) && !/^(file:\/\/|https?:\/\/)/i.test(title)) {
        return title;
      }
    }
    const titleMatch = prefix.match(TITLE_REGEX);
    if (titleMatch) {
      const title = sanitizeTitle(titleMatch[1]);
      if (isUsableTitle(title) && !/^(file:\/\/|https?:\/\/)/i.test(title)) {
        return title;
      }
    }
  }
  return;
}
function extractMessageCount(text) {
  const directMatch = text.match(/(?:messageCount|chat messages?)["\s:=-]+(\d{1,5})/i);
  if (directMatch) {
    return parseInt(directMatch[1], 10);
  }
  return;
}
function decodeStateValue(raw) {
  const parsedJson = tryParseJson(raw);
  if (parsedJson !== null) {
    return {
      raw,
      parsedJson,
      decodedText: raw,
      base64Decoded: false
    };
  }
  if (isLikelyBase64(raw)) {
    try {
      return {
        raw,
        parsedJson: null,
        decodedText: Buffer.from(raw, "base64").toString("utf-8"),
        base64Decoded: true
      };
    } catch {}
  }
  return {
    raw,
    parsedJson: null,
    decodedText: raw,
    base64Decoded: false
  };
}
function extractTrajectoriesFromJson(value) {
  const entries = Array.isArray(value) ? value : typeof value === "object" && value !== null ? Object.entries(value).map(([key, entry]) => ({
    conversationId: key,
    ...typeof entry === "object" && entry !== null ? entry : {}
  })) : [];
  const results = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object")
      continue;
    const record = entry;
    const conversationId = String(record.conversationId || record.id || "");
    if (!conversationId)
      continue;
    const workspaceUri = normalizeWorkspaceUri(typeof record.workspaceUri === "string" ? record.workspaceUri : undefined);
    results.push({
      conversationId,
      title: typeof record.title === "string" ? record.title : undefined,
      messageCount: typeof record.messageCount === "number" ? record.messageCount : undefined,
      lastActivity: typeof record.lastActivity === "string" ? record.lastActivity : undefined,
      workspaceUri: workspaceUri ?? undefined,
      workspaceUris: workspaceUri ? [workspaceUri] : [],
      rawSnippet: undefined
    });
  }
  return results;
}
function extractTrajectorySummariesFromEncodedText(text) {
  const matches = Array.from(text.matchAll(UUID_REGEX));
  const results = [];
  for (let index = 0;index < matches.length; index++) {
    const current = matches[index];
    const conversationId = current[0];
    const currentIndex = current.index ?? 0;
    const nextIndex = matches[index + 1]?.index ?? text.length;
    const previousBoundary = matches[index - 1] ? (matches[index - 1].index ?? 0) + matches[index - 1][0].length : 0;
    const start = Math.max(previousBoundary, currentIndex - 160);
    const end = Math.min(nextIndex, currentIndex + 4000);
    const segment = text.slice(start, end);
    const nestedPayloads = decodeNestedPayloads(segment);
    const combinedText = [toPrintableText(segment), ...nestedPayloads].join(`
`);
    const workspaceUris = findFileUrisInText(combinedText);
    const usefulWorkspaceUris = workspaceUris.filter((uri) => !uri.includes("/.gemini/antigravity/brain/"));
    const workspaceUri = usefulWorkspaceUris[0] ?? workspaceUris[0];
    const title = extractTitle(segment, nestedPayloads, conversationId);
    const messageCount = extractMessageCount(combinedText);
    results.push({
      conversationId,
      title,
      messageCount,
      workspaceUri,
      workspaceUris: usefulWorkspaceUris.length > 0 ? usefulWorkspaceUris : workspaceUris,
      rawSnippet: combinedText.slice(0, 800)
    });
  }
  return results;
}
function extractChatSessions(value) {
  if (!value || typeof value !== "object") {
    return [];
  }
  const root = value;
  const rawEntries = Array.isArray(root.entries) ? root.entries : root.entries && typeof root.entries === "object" ? Object.values(root.entries) : Array.isArray(value) ? value : Object.values(root);
  const sessions = [];
  for (const entry of rawEntries) {
    if (!entry || typeof entry !== "object")
      continue;
    const record = entry;
    const sessionId = String(record.sessionId || record.id || "");
    if (!sessionId)
      continue;
    const workspaceUri = normalizeWorkspaceUri(typeof record.workspaceUri === "string" ? record.workspaceUri : typeof record.workspaceFolder === "string" ? record.workspaceFolder : typeof record.folder === "string" ? record.folder : undefined);
    sessions.push({
      sessionId,
      workspaceUri: workspaceUri ?? undefined,
      title: typeof record.title === "string" ? record.title : undefined,
      lastModified: typeof record.lastModified === "string" ? record.lastModified : typeof record.updatedAt === "string" ? record.updatedAt : undefined
    });
  }
  return sessions;
}
function decodeObjectLikeValue(raw) {
  const decoded = decodeStateValue(raw);
  if (decoded.parsedJson && typeof decoded.parsedJson === "object") {
    return decoded.parsedJson;
  }
  const printable = toPrintableText(decoded.decodedText).trim();
  return printable || null;
}
function parseStateVscdb(customPath) {
  const dbPath = customPath || getGlobalStateDbPath();
  if (!existsSync4(dbPath)) {
    console.warn(`\u26A0\uFE0F  state.vscdb not found at: ${dbPath}`);
    return null;
  }
  let db;
  try {
    db = new Database2(dbPath, { readonly: true });
  } catch (err) {
    console.error("\u274C Failed to open state.vscdb:", err);
    return null;
  }
  try {
    const sessionToWorkspace = new Map;
    const chatIndexRaw = readItemTableRawValue(db, "chat.ChatSessionStore.index");
    const chatSessions = chatIndexRaw ? extractChatSessions(decodeStateValue(chatIndexRaw).parsedJson) : [];
    for (const session of chatSessions) {
      if (session.workspaceUri) {
        sessionToWorkspace.set(session.sessionId, session.workspaceUri);
      }
    }
    const trajectoriesRaw = readItemTableRawValue(db, "antigravityUnifiedStateSync.trajectorySummaries");
    let trajectories = [];
    if (trajectoriesRaw) {
      const decoded = decodeStateValue(trajectoriesRaw);
      trajectories = decoded.parsedJson !== null ? extractTrajectoriesFromJson(decoded.parsedJson) : extractTrajectorySummariesFromEncodedText(decoded.decodedText);
    }
    for (const trajectory of trajectories) {
      if (trajectory.workspaceUri) {
        sessionToWorkspace.set(trajectory.conversationId, trajectory.workspaceUri);
      }
    }
    const creditsRaw = readItemTableRawValue(db, "antigravityUnifiedStateSync.modelCredits");
    const creditsValue = creditsRaw ? decodeObjectLikeValue(creditsRaw) : null;
    let modelCredits = null;
    if (creditsValue && typeof creditsValue === "object") {
      const record = creditsValue;
      modelCredits = {
        used: typeof record.used === "number" ? record.used : 0,
        total: typeof record.total === "number" ? record.total : 0,
        resetDate: typeof record.resetDate === "string" ? record.resetDate : undefined,
        raw: creditsValue
      };
    } else if (creditsValue) {
      modelCredits = {
        used: 0,
        total: 0,
        raw: creditsValue
      };
    }
    const modelPreferencesRaw = readItemTableRawValue(db, "antigravityUnifiedStateSync.modelPreferences");
    const modelPreferences = modelPreferencesRaw ? decodeObjectLikeValue(modelPreferencesRaw) : null;
    return {
      chatSessions,
      trajectories,
      modelCredits,
      modelPreferences,
      sessionToWorkspace
    };
  } finally {
    db.close();
  }
}

// src/ingest/workspace-storage.ts
init_paths();
import { readdirSync, readFileSync as readFileSync3, existsSync as existsSync5 } from "fs";
import { join as join3 } from "path";
function scanWorkspaceStorage(customPath) {
  const storageDir = customPath || getWorkspaceStorageDir();
  if (!existsSync5(storageDir)) {
    console.warn(`\u26A0\uFE0F  workspaceStorage directory not found at: ${storageDir}`);
    return [];
  }
  const entries = [];
  try {
    const hashDirs = readdirSync(storageDir, { withFileTypes: true });
    for (const dir of hashDirs) {
      if (!dir.isDirectory())
        continue;
      const wsJsonPath = join3(storageDir, dir.name, "workspace.json");
      if (!existsSync5(wsJsonPath))
        continue;
      try {
        const content = readFileSync3(wsJsonPath, "utf-8");
        const parsed = JSON.parse(content);
        const uri = parsed.folder || parsed.workspace || parsed.uri || "";
        if (uri) {
          const normalizedUri = normalizeWorkspaceUri(String(uri));
          if (!normalizedUri)
            continue;
          entries.push({
            hash: dir.name,
            uri: String(uri),
            normalizedUri,
            name: extractWorkspaceNameFromUri(String(uri))
          });
        }
      } catch {}
    }
  } catch (err) {
    console.error(`\u274C Failed to scan workspaceStorage:`, err);
  }
  return entries;
}

// src/scanner/conversation-scanner.ts
init_paths();
import { readdirSync as readdirSync2, statSync, readFileSync as readFileSync4, existsSync as existsSync6 } from "fs";
import { join as join4, basename, extname } from "path";
function scanConversations(customPath) {
  const convDir = customPath || getConversationsDir();
  if (!existsSync6(convDir)) {
    console.warn(`\u26A0\uFE0F  conversations directory not found at: ${convDir}`);
    return [];
  }
  const entries = [];
  try {
    const files = readdirSync2(convDir);
    for (const file of files) {
      if (extname(file) !== ".pb")
        continue;
      const filePath = join4(convDir, file);
      const id = basename(file, ".pb");
      try {
        const stats = statSync(filePath);
        const annotation = readAnnotation(id);
        entries.push({
          id,
          pbFilePath: filePath,
          pbFileBytes: stats.size,
          createdAt: stats.birthtime,
          lastModified: stats.mtime,
          annotationTimestamp: annotation?.lastUserViewTime ?? null
        });
      } catch {}
    }
  } catch (err) {
    console.error(`\u274C Failed to scan conversations:`, err);
  }
  return entries.sort((a, b) => b.pbFileBytes - a.pbFileBytes);
}
function readAnnotation(conversationId, customDir) {
  const annDir = customDir || getAnnotationsDir();
  const annPath = join4(annDir, `${conversationId}.pbtxt`);
  if (!existsSync6(annPath))
    return null;
  try {
    const content = readFileSync4(annPath, "utf-8");
    let lastUserViewTime = null;
    const nestedSeconds = content.match(/last_user_view_time\s*:\s*\{\s*seconds\s*:\s*(\d+)/);
    const flatValue = content.match(/last_user_view_time\s*:\s*(\d+)/);
    if (nestedSeconds) {
      lastUserViewTime = parseInt(nestedSeconds[1], 10) * 1000;
    } else if (flatValue) {
      lastUserViewTime = parseInt(flatValue[1], 10) * 1000;
    }
    return {
      conversationId,
      lastUserViewTime,
      rawContent: content
    };
  } catch {
    return null;
  }
}

// src/scanner/brain-scanner.ts
init_paths();
import { readdirSync as readdirSync3, statSync as statSync2, readFileSync as readFileSync5, existsSync as existsSync7 } from "fs";
import { join as join5 } from "path";
function dirStats(dirPath) {
  let totalBytes = 0;
  let fileCount = 0;
  try {
    const entries = readdirSync3(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join5(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = dirStats(fullPath);
        totalBytes += sub.totalBytes;
        fileCount += sub.fileCount;
      } else if (entry.isFile()) {
        try {
          totalBytes += statSync2(fullPath).size;
          fileCount++;
        } catch {}
      }
    }
  } catch {}
  return { totalBytes, fileCount };
}
function countResolvedVersions(dirPath) {
  let count = 0;
  try {
    const entries = readdirSync3(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && /\.resolved\.\d+$/.test(entry.name)) {
        count++;
      }
      if (entry.isDirectory()) {
        count += countResolvedVersions(join5(dirPath, entry.name));
      }
    }
  } catch {}
  return count;
}
function countArtifacts(dirPath) {
  let count = 0;
  try {
    const entries = readdirSync3(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += countArtifacts(join5(dirPath, entry.name));
      } else if (entry.isFile()) {
        if (!entry.name.endsWith(".metadata.json") && !/\.resolved\.\d+$/.test(entry.name) && entry.name !== "overview.txt") {
          count++;
        }
      }
    }
  } catch {}
  return count;
}
function extractWorkspaceUris(dirPath) {
  const uris = new Set;
  try {
    const entries = readdirSync3(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join5(dirPath, entry.name);
      if (entry.isDirectory()) {
        for (const uri of extractWorkspaceUris(fullPath)) {
          uris.add(uri);
        }
      } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".txt"))) {
        try {
          const content = readFileSync5(fullPath, "utf-8");
          for (const uri of findFileUrisInText(content)) {
            uris.add(uri);
          }
        } catch {}
      }
    }
  } catch {}
  return Array.from(uris);
}
function extractBrainTitle(dirPath) {
  const preferredFiles = [
    "task.md",
    "walkthrough.md",
    "overview.txt",
    "task.md.metadata.json",
    "walkthrough.md.metadata.json"
  ];
  for (const fileName of preferredFiles) {
    const filePath = join5(dirPath, fileName);
    if (!existsSync7(filePath))
      continue;
    try {
      const content = readFileSync5(filePath, "utf-8");
      const headingMatch = content.match(/^#\s+(.+)$/m);
      if (headingMatch?.[1]) {
        return headingMatch[1].trim();
      }
      if (fileName.endsWith(".json")) {
        const parsed = JSON.parse(content);
        if (typeof parsed.summary === "string" && parsed.summary.trim().length >= 6) {
          return parsed.summary.trim();
        }
      }
    } catch {
      continue;
    }
  }
  return;
}
function scanBrainFolders(customPath) {
  const brainDir = customPath || getBrainDir();
  if (!existsSync7(brainDir)) {
    console.warn(`\u26A0\uFE0F  brain directory not found at: ${brainDir}`);
    return [];
  }
  const entries = [];
  try {
    const dirs = readdirSync3(brainDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory())
        continue;
      const name = dir.name;
      if (name.startsWith("."))
        continue;
      const brainPath = join5(brainDir, name);
      const stats = dirStats(brainPath);
      const resolvedCount = countResolvedVersions(brainPath);
      const artifactCount = countArtifacts(brainPath);
      const workspaceUris = extractWorkspaceUris(brainPath);
      entries.push({
        conversationId: name,
        totalBytes: stats.totalBytes,
        fileCount: stats.fileCount,
        artifactCount,
        resolvedVersionCount: resolvedCount,
        workspaceUris,
        title: extractBrainTitle(brainPath),
        brainPath
      });
    }
  } catch (err) {
    console.error(`\u274C Failed to scan brain folders:`, err);
  }
  return entries.sort((a, b) => b.totalBytes - a.totalBytes);
}

// src/ingest/reconciler.ts
init_log_signals();
var UNMAPPED_WORKSPACE_ID = "__unmapped__";
var UNMAPPED_WORKSPACE_URI = "__unmapped__";
function toIsoString(timestamp) {
  const date = new Date(timestamp.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function buildWorkspaceRegistry(storageWorkspaces, workspaceStorageEntries) {
  const registry = new Map;
  const addWorkspace = (entry) => {
    if (!entry.normalizedUri)
      return;
    if (registry.has(entry.normalizedUri))
      return;
    registry.set(entry.normalizedUri, {
      id: entry.hash,
      uri: entry.uri,
      normalizedUri: entry.normalizedUri,
      name: entry.name || extractWorkspaceNameFromUri(entry.uri)
    });
  };
  for (const workspace of storageWorkspaces) {
    addWorkspace(workspace);
  }
  for (const workspace of workspaceStorageEntries) {
    addWorkspace(workspace);
  }
  registry.set(UNMAPPED_WORKSPACE_URI, {
    id: UNMAPPED_WORKSPACE_ID,
    uri: UNMAPPED_WORKSPACE_URI,
    normalizedUri: UNMAPPED_WORKSPACE_URI,
    name: "[Unmapped]"
  });
  return registry;
}
function findWorkspaceMatch(candidateUris, registry, sourcePrefix, exactConfidence, prefixConfidence) {
  for (const candidate of candidateUris) {
    const normalizedCandidate = normalizeWorkspaceUri(candidate);
    if (!normalizedCandidate)
      continue;
    const exact = registry.get(normalizedCandidate);
    if (exact && exact.id !== UNMAPPED_WORKSPACE_ID) {
      return {
        workspaceId: exact.id,
        workspaceUri: exact.uri,
        mappingSource: `${sourcePrefix}_exact`,
        mappingConfidence: exactConfidence,
        mappingNotes: `Matched normalized workspace URI from ${sourcePrefix}.`
      };
    }
    for (const workspace of registry.values()) {
      if (workspace.id === UNMAPPED_WORKSPACE_ID)
        continue;
      if (uriMatchesWorkspaceRoot(normalizedCandidate, workspace.normalizedUri)) {
        return {
          workspaceId: workspace.id,
          workspaceUri: workspace.uri,
          mappingSource: `${sourcePrefix}_prefix`,
          mappingConfidence: prefixConfidence,
          mappingNotes: `Matched a file URI beneath the workspace root from ${sourcePrefix}.`
        };
      }
    }
  }
  return null;
}
function findWorkspaceByTitleHint(titleCandidates, registry) {
  const matches = new Map;
  for (const rawTitle of titleCandidates) {
    const title = rawTitle?.trim();
    if (!title)
      continue;
    const normalizedTitle = title.toLowerCase();
    for (const workspace2 of registry.values()) {
      if (workspace2.id === UNMAPPED_WORKSPACE_ID)
        continue;
      const name = workspace2.name.trim();
      if (name.length < 4)
        continue;
      if (normalizedTitle.includes(name.toLowerCase())) {
        matches.set(workspace2.id, workspace2);
      }
    }
  }
  if (matches.size !== 1) {
    return null;
  }
  const workspace = Array.from(matches.values())[0];
  return {
    workspaceId: workspace.id,
    workspaceUri: workspace.uri,
    mappingSource: "title_hint",
    mappingConfidence: 0.55,
    mappingNotes: "Matched the workspace name from conversation or brain-title text because no URI signal was available."
  };
}
function buildUnmappedReason(trajectory, brain) {
  const stateUriCount = trajectory?.workspaceUris.length ?? 0;
  const brainUriCount = brain?.workspaceUris.length ?? 0;
  const titleHints = [trajectory?.title, brain?.title].filter((value) => Boolean(value?.trim()));
  if (stateUriCount === 0 && brainUriCount === 0 && titleHints.length === 0) {
    return "No workspace URI, brain URI, or usable title hint was found.";
  }
  const parts = [];
  if (stateUriCount > 0) {
    parts.push(`state.vscdb exposed ${stateUriCount} workspace URI${stateUriCount > 1 ? "s" : ""} but none matched a known workspace`);
  }
  if (brainUriCount > 0) {
    parts.push(`brain artifacts exposed ${brainUriCount} workspace URI${brainUriCount > 1 ? "s" : ""} but none matched a known workspace`);
  }
  if (titleHints.length > 0) {
    parts.push(`title hints (${titleHints.map((title) => `"${title}"`).join(", ")}) did not uniquely identify a workspace`);
  }
  return `${parts.join("; ")}.`;
}
function chooseLastActive(conversationId, annotationTimestamp, lastModified, logSignals) {
  const logTimestamp = logSignals.lastActivityAt.get(conversationId);
  if (logTimestamp) {
    const iso = toIsoString(logTimestamp);
    if (iso) {
      return { lastActiveAt: iso, activitySource: "log" };
    }
  }
  if (annotationTimestamp) {
    return {
      lastActiveAt: new Date(annotationTimestamp).toISOString(),
      activitySource: "annotation"
    };
  }
  return {
    lastActiveAt: lastModified.toISOString(),
    activitySource: "filesystem"
  };
}
function indexTrajectories(trajectories) {
  const map = new Map;
  for (const trajectory of trajectories) {
    map.set(trajectory.conversationId, trajectory);
  }
  return map;
}
async function reconcile(db, config) {
  const stats = {
    workspacesFound: 0,
    conversationsTotal: 0,
    conversationsMapped: 0,
    conversationsUnmapped: 0,
    brainFoldersFound: 0,
    orphanBrainFolders: 0,
    orphanAnnotations: 0,
    totalPbBytes: 0,
    totalBrainBytes: 0
  };
  const storageResult = parseStorageJson();
  const workspaceStorageEntries = scanWorkspaceStorage();
  const workspaceRegistry = buildWorkspaceRegistry(storageResult?.workspaces ?? [], workspaceStorageEntries);
  const stateResult = parseStateVscdb();
  const trajectoryByConversation = indexTrajectories(stateResult?.trajectories ?? []);
  const logSignals = scanLatestLogFile();
  const conversations = scanConversations();
  const brainEntries = scanBrainFolders();
  const brainByConversation = new Map;
  for (const brainEntry of brainEntries) {
    brainByConversation.set(brainEntry.conversationId, brainEntry);
  }
  const now = new Date().toISOString();
  for (const workspace of workspaceRegistry.values()) {
    db.upsertWorkspace({
      id: workspace.id,
      uri: workspace.uri,
      name: workspace.name,
      last_seen: now
    });
  }
  stats.workspacesFound = workspaceRegistry.size;
  const scannedConversationIds = [];
  const activeConversationId = logSignals.activeConversationId;
  for (const conversationEntry of conversations) {
    scannedConversationIds.push(conversationEntry.id);
    const brain = brainByConversation.get(conversationEntry.id);
    const trajectory = trajectoryByConversation.get(conversationEntry.id);
    const stateUris = trajectory?.workspaceUris ?? (trajectory?.workspaceUri ? [trajectory.workspaceUri] : []);
    const brainUris = brain?.workspaceUris ?? [];
    const mapping = findWorkspaceMatch(stateUris, workspaceRegistry, "state_vscdb", 1, 0.92) ?? findWorkspaceMatch(brainUris, workspaceRegistry, "brain_artifact", 0.8, 0.72) ?? findWorkspaceByTitleHint([trajectory?.title, brain?.title], workspaceRegistry) ?? {
      workspaceId: UNMAPPED_WORKSPACE_ID,
      workspaceUri: UNMAPPED_WORKSPACE_URI,
      mappingSource: "unmapped",
      mappingConfidence: 0,
      mappingNotes: buildUnmappedReason(trajectory, brain)
    };
    if (mapping.workspaceId === UNMAPPED_WORKSPACE_ID) {
      stats.conversationsUnmapped++;
    } else {
      stats.conversationsMapped++;
    }
    const directMessageCount = logSignals.messageCounts.get(conversationEntry.id);
    const messageCount = directMessageCount ?? trajectory?.messageCount ?? null;
    const messageCountSource = directMessageCount !== undefined ? "log" : trajectory?.messageCount !== undefined ? "state_vscdb" : null;
    const activity = chooseLastActive(conversationEntry.id, conversationEntry.annotationTimestamp, conversationEntry.lastModified, logSignals);
    const metrics = estimateConversationMetrics({
      pbFileBytes: conversationEntry.pbFileBytes,
      brainFolderBytes: brain?.totalBytes ?? 0,
      messageCount,
      resolvedVersionCount: brain?.resolvedVersionCount ?? 0,
      bytesPerToken: config.bytesPerToken
    });
    const canonicalConversation = {
      id: conversationEntry.id,
      workspace_id: mapping.workspaceId,
      title: trajectory?.title ?? brain?.title ?? null,
      pb_file_bytes: conversationEntry.pbFileBytes,
      brain_folder_bytes: brain?.totalBytes ?? 0,
      brain_artifact_count: brain?.artifactCount ?? 0,
      resolved_version_count: brain?.resolvedVersionCount ?? 0,
      message_count: messageCount,
      message_count_source: messageCountSource,
      estimated_prompt_tokens: metrics.estimatedPromptTokens,
      estimated_artifact_tokens: metrics.estimatedArtifactTokens,
      estimated_tokens: metrics.estimatedTotalTokens,
      annotation_timestamp: conversationEntry.annotationTimestamp,
      created_at: conversationEntry.createdAt.toISOString(),
      last_modified: conversationEntry.lastModified.toISOString(),
      last_active_at: activity.lastActiveAt,
      activity_source: activity.activitySource,
      mapping_source: mapping.mappingSource,
      mapping_confidence: mapping.mappingConfidence,
      mapping_notes: mapping.mappingNotes,
      is_active: activeConversationId === conversationEntry.id ? 1 : 0
    };
    db.upsertConversation(canonicalConversation);
    takeSnapshotIfChanged(db, canonicalConversation);
    stats.totalPbBytes += canonicalConversation.pb_file_bytes;
    stats.totalBrainBytes += canonicalConversation.brain_folder_bytes;
  }
  db.deleteConversationsNotIn(scannedConversationIds);
  for (const workspace of workspaceRegistry.values()) {
    db.updateWorkspaceAggregates(workspace.id);
  }
  const scannedConversationIdSet = new Set(scannedConversationIds);
  for (const brainEntry of brainEntries) {
    if (!scannedConversationIdSet.has(brainEntry.conversationId)) {
      stats.orphanBrainFolders++;
    }
  }
  stats.conversationsTotal = conversations.length;
  stats.brainFoldersFound = brainEntries.length;
  return stats;
}
// src/metrics/health.ts
function assessHealth(estimatedTokens, bloatLimit) {
  const ratio = estimatedTokens / bloatLimit;
  let status;
  let emoji;
  let label;
  if (ratio > 1) {
    status = "OVER" /* OVER */;
    emoji = "\uD83D\uDC80";
    label = "OVER LIMIT";
  } else if (ratio > 0.8) {
    status = "CRITICAL" /* CRITICAL */;
    emoji = "\uD83D\uDD34";
    label = "CRITICAL";
  } else if (ratio > 0.5) {
    status = "WARNING" /* WARNING */;
    emoji = "\uD83D\uDFE1";
    label = "WARNING";
  } else {
    status = "HEALTHY" /* HEALTHY */;
    emoji = "\uD83D\uDFE2";
    label = "HEALTHY";
  }
  return { status, emoji, label, ratio, estimatedTokens, bloatLimit };
}
function assessWorkspaceHealth(conversationTokens, bloatLimit) {
  if (conversationTokens.length === 0) {
    return assessHealth(0, bloatLimit);
  }
  const totalTokens = conversationTokens.reduce((sum, t) => sum + t, 0);
  const worstConversation = Math.max(...conversationTokens);
  return assessHealth(worstConversation, bloatLimit);
}
// src/view-models.ts
function relativeTime(dateValue) {
  if (!dateValue)
    return "unknown";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0)
    return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0)
    return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0)
    return `${minutes} min ago`;
  return "just now";
}
function workspaceLookup(db) {
  const map = new Map;
  for (const workspace of db.getAllWorkspaces()) {
    map.set(workspace.id, workspace);
  }
  return map;
}
function buildWorkspaceUriHint(uri, workspaceName) {
  const normalized = normalizeWorkspaceUri(uri);
  if (!normalized || normalized === "__unmapped__")
    return null;
  if (isPlaygroundUri(normalized))
    return "playground";
  const withoutScheme = normalized.replace(/^file:\/\/\/?/i, "");
  const parts = withoutScheme.split("/").filter(Boolean);
  if (parts.length === 0)
    return null;
  const last = parts[parts.length - 1] ?? "";
  const parent = parts[parts.length - 2] ?? "";
  if (last.toLowerCase() === workspaceName.toLowerCase()) {
    return parent || last;
  }
  return parts.slice(-2).join("/");
}
function buildConversationViewModel(db, config, conversation, workspaces = workspaceLookup(db)) {
  const workspace = conversation.workspace_id ? workspaces.get(conversation.workspace_id) ?? null : null;
  const health = assessHealth(conversation.estimated_tokens, config.bloatLimit);
  const deltaEstimatedTokens = getLatestDeltaTokens(db, conversation.id);
  return {
    id: conversation.id,
    title: conversation.title,
    workspaceId: conversation.workspace_id,
    workspaceName: workspace?.name ?? "[Unknown]",
    workspaceUri: workspace?.uri ?? null,
    pbFileBytes: conversation.pb_file_bytes,
    pbSizeFormatted: formatBytes(conversation.pb_file_bytes),
    brainSizeBytes: conversation.brain_folder_bytes,
    brainSizeFormatted: formatBytes(conversation.brain_folder_bytes),
    messageCount: conversation.message_count,
    messageCountSource: conversation.message_count_source,
    isActive: conversation.is_active === 1,
    lastActiveAt: conversation.last_active_at,
    lastActiveRelative: relativeTime(conversation.last_active_at),
    mappingSource: conversation.mapping_source,
    mappingConfidence: conversation.mapping_confidence,
    mappingNote: conversation.mapping_notes,
    estimatedPromptTokens: conversation.estimated_prompt_tokens,
    estimatedArtifactTokens: conversation.estimated_artifact_tokens,
    estimatedTotalTokens: conversation.estimated_tokens,
    estimatedTokens: conversation.estimated_tokens,
    estimatedTotalTokensFormatted: formatTokens(conversation.estimated_tokens),
    contextRatio: config.bloatLimit > 0 ? conversation.estimated_tokens / config.bloatLimit : 0,
    contextRatioFormatted: formatRatio(config.bloatLimit > 0 ? conversation.estimated_tokens / config.bloatLimit : 0),
    deltaEstimatedTokens,
    deltaEstimatedTokensFormatted: `${deltaEstimatedTokens >= 0 ? "+" : "-"}${formatTokens(Math.abs(deltaEstimatedTokens))}`,
    whyHeavy: explainWhyHeavy(conversation.estimated_prompt_tokens, conversation.estimated_artifact_tokens, conversation.estimated_tokens, config.bloatLimit),
    health: health.status,
    healthEmoji: health.emoji
  };
}
function listConversationViewModels(db, config, conversations) {
  const workspaces = workspaceLookup(db);
  return conversations.map((conversation) => buildConversationViewModel(db, config, conversation, workspaces));
}
function buildWorkspaceViewModel(db, config, workspace, conversations = db.getConversationsByWorkspace(workspace.id)) {
  const views = listConversationViewModels(db, config, conversations);
  const largestConversation = [...views].sort((left, right) => right.estimatedTotalTokens - left.estimatedTotalTokens)[0] ?? null;
  const totalEstimatedTokens = views.reduce((sum, view) => sum + view.estimatedTotalTokens, 0);
  const directMessageCounts = views.filter((view) => view.messageCount !== null).map((view) => view.messageCount);
  const hasUnknownMessages = views.some((view) => view.messageCount === null);
  const health = assessWorkspaceHealth(views.map((view) => view.estimatedTotalTokens), config.bloatLimit);
  return {
    id: workspace.id,
    name: workspace.name,
    displayName: workspace.name,
    uri: workspace.uri,
    uriHint: buildWorkspaceUriHint(workspace.uri, workspace.name),
    estimatedTokens: totalEstimatedTokens,
    estimatedTokensFormatted: formatTokens(totalEstimatedTokens),
    conversationCount: views.length,
    activeConversationCount: views.filter((view) => view.isActive).length,
    largestConversationId: largestConversation?.id ?? null,
    largestConversationTokens: largestConversation?.estimatedTotalTokens ?? 0,
    largestConversationTokensFormatted: largestConversation ? formatTokens(largestConversation.estimatedTotalTokens) : "0",
    mappedConversationCount: views.filter((view) => view.mappingSource !== "unmapped").length,
    unmappedConversationCount: views.filter((view) => view.mappingSource === "unmapped").length,
    messageCount: hasUnknownMessages ? null : directMessageCounts.reduce((sum, value) => sum + value, 0),
    hasUnknownMessages,
    brainSizeBytes: workspace.total_brain_bytes,
    brainSizeFormatted: formatBytes(workspace.total_brain_bytes),
    pbSizeBytes: workspace.total_pb_bytes,
    pbSizeFormatted: formatBytes(workspace.total_pb_bytes),
    health: health.status,
    healthEmoji: health.emoji
  };
}
function listWorkspaceViewModels(db, config) {
  const views = db.getAllWorkspaces().map((workspace) => buildWorkspaceViewModel(db, config, workspace)).sort((left, right) => right.estimatedTokens - left.estimatedTokens);
  const duplicateCounts = new Map;
  for (const view of views) {
    duplicateCounts.set(view.name, (duplicateCounts.get(view.name) ?? 0) + 1);
  }
  return views.map((view) => {
    if ((duplicateCounts.get(view.name) ?? 0) <= 1) {
      return view;
    }
    const suffix = view.uriHint ?? view.id.slice(0, 8);
    return {
      ...view,
      displayName: `${view.name} [${suffix}]`
    };
  });
}
function getCurrentConversationView(db, config) {
  const activeConversation = db.getAllConversations().find((conversation) => conversation.is_active === 1) ?? null;
  if (activeConversation) {
    return {
      mode: "active",
      detectionSource: activeConversation.activity_source === "log" ? "log" : "active_flag",
      detectionNote: activeConversation.activity_source === "log" ? "Detected from Antigravity runtime log activity." : "Marked active from the latest runtime signal.",
      conversation: buildConversationViewModel(db, config, activeConversation)
    };
  }
  const mostRecentConversation = db.getCurrentConversation();
  if (mostRecentConversation) {
    return {
      mode: "recent",
      detectionSource: "recent_fallback",
      detectionNote: "No live active conversation could be confirmed from logs, so the most recent session is shown instead.",
      conversation: buildConversationViewModel(db, config, mostRecentConversation)
    };
  }
  return {
    mode: "none",
    detectionSource: "none",
    detectionNote: "No conversation data is available yet.",
    conversation: null
  };
}

// src/cli/commands/scan.ts
function registerScanCommand(program2, db, config) {
  program2.command("scan").description("Scan Antigravity data and display workspace/conversation metrics").option("-w, --workspace <name>", "Drill into a specific workspace").option("-c, --conversation <uuid>", "Show a single conversation by id").option("--current", "Show only the current or most recent conversation").option("--watch", "Enter live monitoring mode (file watcher + log tailer)").option("--json", "Output raw JSON").action(async (options) => {
    const useJson = options.json || program2.opts().json;
    const watchMode = Boolean(options.watch);
    if (useJson && watchMode) {
      console.error("watch mode does not support --json");
      process.exitCode = 1;
      return;
    }
    if (!useJson) {
      console.log(source_default.dim("Scanning Antigravity data..."));
    }
    const startTime = Date.now();
    const stats = await reconcile(db, config);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (!useJson) {
      console.log(source_default.dim(`   Scanned ${stats.conversationsTotal} conversations in ${elapsed}s`));
      console.log(source_default.dim(`   Mapped: ${stats.conversationsMapped} | Unmapped: ${stats.conversationsUnmapped} | Brain orphans: ${stats.orphanBrainFolders}`));
      console.log();
    }
    if (options.conversation) {
      displayConversationDetail(db, config, options.conversation, useJson);
      return;
    }
    if (options.current) {
      displayCurrentConversation(db, config, useJson);
      return;
    }
    if (options.workspace) {
      displayWorkspaceDetail(db, config, options.workspace, useJson);
      return;
    }
    if (watchMode) {
      console.log(source_default.yellow("Watch mode - press Ctrl+C to exit"));
      console.log();
      displayCurrentConversation(db, config, false);
      console.log();
      displayWorkspaceSummary(db, config, false);
      console.log();
      console.log(source_default.dim("   Monitoring live session growth..."));
      const { startFileWatcher: startFileWatcher2 } = await Promise.resolve().then(() => (init_file_watcher(), exports_file_watcher));
      const { startLogTailer: startLogTailer2 } = await Promise.resolve().then(() => (init_log_tailer(), exports_log_tailer));
      startFileWatcher2(db, config);
      startLogTailer2(db, config);
      return;
    }
    if (useJson) {
      console.log(JSON.stringify(buildScanSummaryJson(db, config), null, 2));
      return;
    }
    displayCurrentConversation(db, config, false);
    console.log();
    displayWorkspaceSummary(db, config, false);
  });
}
function buildScanSummaryJson(db, config) {
  const current = getCurrentConversationView(db, config);
  const workspaces = sortWorkspacesForDisplay(listWorkspaceViewModels(db, config).filter((workspace) => workspace.conversationCount > 0 || workspace.uri === "__unmapped__"), current.conversation?.workspaceId ?? null);
  return {
    currentConversation: current,
    workspaces
  };
}
function displayCurrentConversation(db, config, useJson) {
  const current = getCurrentConversationView(db, config);
  if (useJson) {
    console.log(JSON.stringify(current, null, 2));
    return;
  }
  if (!current.conversation) {
    console.log(source_default.bold("Current Conversation"));
    console.log(source_default.dim("  No conversations found."));
    return;
  }
  const label = current.mode === "active" ? "Current Conversation" : "Most Recent Conversation";
  displayConversationCard(current.conversation, label, current);
}
function displayWorkspaceSummary(db, config, useJson) {
  const current = getCurrentConversationView(db, config);
  const workspaces = sortWorkspacesForDisplay(listWorkspaceViewModels(db, config).filter((workspace) => workspace.conversationCount > 0 || workspace.uri === "__unmapped__"), current.conversation?.workspaceId ?? null);
  if (useJson) {
    console.log(JSON.stringify({ workspaces }, null, 2));
    return;
  }
  const table = new import_cli_table3.default({
    head: [
      source_default.bold("Now"),
      source_default.bold("Workspace"),
      source_default.bold("Est.Total"),
      source_default.bold("Chats"),
      source_default.bold("Map/U"),
      source_default.bold("Brain"),
      source_default.bold("Largest"),
      source_default.bold("Health")
    ],
    style: { head: [], border: [] },
    colWidths: [8, 30, 12, 8, 10, 10, 12, 10]
  });
  for (const workspace of workspaces) {
    const now = current.conversation?.workspaceId === workspace.id ? current.mode === "active" ? "live" : "recent" : "";
    table.push([
      now,
      truncate(workspace.displayName, 28),
      workspace.estimatedTokensFormatted,
      String(workspace.conversationCount),
      `${workspace.mappedConversationCount}/${workspace.unmappedConversationCount}`,
      workspace.brainSizeFormatted,
      workspace.largestConversationTokensFormatted,
      workspace.healthEmoji
    ]);
  }
  console.log(table.toString());
}
function displayWorkspaceDetail(db, config, workspaceQuery, useJson) {
  const resolved = resolveWorkspaceSelection(db, config, workspaceQuery);
  if (resolved.type === "missing") {
    console.error(source_default.red(`Workspace "${workspaceQuery}" not found`));
    return;
  }
  if (resolved.type === "ambiguous") {
    console.error(source_default.yellow(`Workspace "${workspaceQuery}" is ambiguous. Matches:`));
    for (const match of resolved.matches) {
      console.error(source_default.dim(`  - ${match.displayName}`));
    }
    return;
  }
  const { workspace, workspaceView } = resolved;
  const conversations = listConversationViewModels(db, config, db.getConversationsByWorkspace(workspace.id));
  if (useJson) {
    console.log(JSON.stringify({ workspace: workspaceView, conversations }, null, 2));
    return;
  }
  console.log(source_default.bold(`Workspace: ${workspaceView.displayName}`));
  console.log(source_default.dim(`  Location: ${workspaceView.uri}`));
  console.log(source_default.dim(`  Estimated total: ${workspaceView.estimatedTokensFormatted} tokens`));
  console.log(source_default.dim(`  Storage: ${workspaceView.pbSizeFormatted} conversation data | ${workspaceView.brainSizeFormatted} brain data`));
  console.log(source_default.dim(`  Conversations: ${workspaceView.conversationCount} (${workspaceView.mappedConversationCount} mapped, ${workspaceView.unmappedConversationCount} unmapped)`));
  console.log(source_default.dim(`  Largest session: ${workspaceView.largestConversationTokensFormatted}`));
  console.log();
  const table = new import_cli_table3.default({
    head: [
      source_default.bold("Session"),
      source_default.bold("Title"),
      source_default.bold("Est.Total"),
      source_default.bold("Msgs"),
      source_default.bold("Last Active"),
      source_default.bold("Map"),
      source_default.bold("Health")
    ],
    style: { head: [], border: [] },
    colWidths: [16, 30, 12, 12, 14, 18, 10]
  });
  for (const conversation of conversations) {
    table.push([
      `${conversation.id.slice(0, 12)}...`,
      truncate(conversation.title ?? "Untitled", 28),
      conversation.estimatedTotalTokensFormatted,
      truncate(formatMessageCount(conversation), 10),
      conversation.lastActiveRelative,
      truncate(conversation.mappingSource ?? "unknown", 16),
      conversation.healthEmoji
    ]);
  }
  console.log(table.toString());
}
function displayConversationDetail(db, config, conversationId, useJson) {
  const conversation = db.getConversation(conversationId);
  if (!conversation) {
    console.error(source_default.red(`Conversation "${conversationId}" not found`));
    return;
  }
  const view = listConversationViewModels(db, config, [conversation])[0];
  if (!view) {
    console.error(source_default.red(`Conversation "${conversationId}" not found`));
    return;
  }
  if (useJson) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  const currentContext = view.isActive ? {
    mode: "active",
    detectionSource: "active_flag",
    detectionNote: "Marked active from the latest runtime signal.",
    conversation: view
  } : {
    mode: "recent",
    detectionSource: "recent_fallback",
    detectionNote: "Direct conversation lookup does not imply this is the current live session.",
    conversation: view
  };
  displayConversationCard(view, "Conversation Detail", currentContext);
}
function displayConversationCard(view, label, current) {
  console.log(source_default.bold(label));
  console.log(source_default.dim(`  Session: ${view.id}`));
  console.log(source_default.dim(`  Title: ${view.title ?? "Untitled"}`));
  console.log(source_default.dim(`  Workspace: ${view.workspaceName}`));
  console.log(source_default.dim(`  Detection: ${current.detectionNote}`));
  console.log(source_default.dim(`  Last Active: ${view.lastActiveRelative}${view.lastActiveAt ? ` (${view.lastActiveAt})` : ""}${current.mode === "active" ? " [ACTIVE]" : ""}`));
  console.log(source_default.dim(`  Messages: ${view.messageCount !== null ? view.messageCount : "unknown"}${view.messageCountSource ? ` (${view.messageCountSource})` : ""}`));
  console.log(source_default.dim(`  Estimated Context: ${view.estimatedTotalTokensFormatted} tokens (${view.contextRatioFormatted} of limit)`));
  console.log(source_default.dim(`  Breakdown: prompt/history ${view.estimatedPromptTokens.toLocaleString()} | artifacts ${view.estimatedArtifactTokens.toLocaleString()}`));
  console.log(source_default.dim(`  Delta: ${view.deltaEstimatedTokensFormatted} estimated tokens`));
  console.log(source_default.dim(`  Mapping: ${view.mappingSource ?? "unknown"} (${view.mappingConfidence ?? 0})`));
  if (view.mappingNote) {
    console.log(source_default.dim(`  Mapping Note: ${view.mappingNote}`));
  }
  console.log(source_default.dim(`  Why Heavy: ${view.whyHeavy}`));
}
function resolveWorkspaceSelection(db, config, query) {
  const workspaceViews = listWorkspaceViewModels(db, config).filter((workspace) => workspace.conversationCount > 0 || workspace.uri === "__unmapped__");
  const workspacesById = new Map(db.getAllWorkspaces().map((workspace) => [workspace.id, workspace]));
  const normalizedQuery = query.toLowerCase();
  const toResolved = (matches) => matches.map((match) => ({ view: match, workspace: workspacesById.get(match.id) ?? null })).filter((entry) => entry.workspace !== null);
  const exactDisplay = toResolved(workspaceViews.filter((workspace) => workspace.displayName.toLowerCase() === normalizedQuery));
  if (exactDisplay.length === 1) {
    return {
      type: "resolved",
      workspace: exactDisplay[0].workspace,
      workspaceView: exactDisplay[0].view
    };
  }
  if (exactDisplay.length > 1) {
    return { type: "ambiguous", matches: exactDisplay.map((entry) => entry.view) };
  }
  const exactName = toResolved(workspaceViews.filter((workspace) => workspace.name.toLowerCase() === normalizedQuery));
  if (exactName.length === 1) {
    return {
      type: "resolved",
      workspace: exactName[0].workspace,
      workspaceView: exactName[0].view
    };
  }
  if (exactName.length > 1) {
    return { type: "ambiguous", matches: exactName.map((entry) => entry.view) };
  }
  const partial = toResolved(workspaceViews.filter((workspace) => workspace.displayName.toLowerCase().includes(normalizedQuery) || workspace.name.toLowerCase().includes(normalizedQuery)));
  if (partial.length === 1) {
    return {
      type: "resolved",
      workspace: partial[0].workspace,
      workspaceView: partial[0].view
    };
  }
  if (partial.length > 1) {
    return { type: "ambiguous", matches: partial.map((entry) => entry.view) };
  }
  return { type: "missing" };
}
function sortWorkspacesForDisplay(workspaces, currentWorkspaceId) {
  return [...workspaces].sort((left, right) => {
    if (currentWorkspaceId && left.id === currentWorkspaceId && right.id !== currentWorkspaceId)
      return -1;
    if (currentWorkspaceId && right.id === currentWorkspaceId && left.id !== currentWorkspaceId)
      return 1;
    return right.estimatedTokens - left.estimatedTokens;
  });
}
function formatMessageCount(view) {
  if (view.messageCount === null) {
    return "unknown";
  }
  return view.messageCountSource ? `${view.messageCount} (${view.messageCountSource})` : String(view.messageCount);
}
function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

// src/cli/commands/report.ts
init_source();
var import_cli_table32 = __toESM(require_table(), 1);
import { basename as basename3 } from "path";
import { existsSync as existsSync11, readdirSync as readdirSync5 } from "fs";
init_paths();
function registerReportCommand(program2, db, config) {
  program2.command("report").description("Generate a cache health report with cleanup targets").option("--json", "Output raw JSON").action(async (options) => {
    const useJson = options.json || program2.opts().json;
    if (!useJson) {
      console.log(source_default.dim("Scanning Antigravity data..."));
    }
    await reconcile(db, config);
    const report = buildReport(db, config);
    if (useJson) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(source_default.bold("AG Kernel Monitor - Health Report"));
    console.log();
    console.log(source_default.bold("Current Risk"));
    if (report.currentConversation.conversation) {
      const current = report.currentConversation.conversation;
      console.log(source_default.dim(`  Session: ${current.id}`));
      console.log(source_default.dim(`  Workspace: ${current.workspaceName}`));
      console.log(source_default.dim(`  Title: ${current.title ?? "Untitled"}`));
      console.log(source_default.dim(`  Detection: ${report.currentConversation.detectionNote}`));
      console.log(source_default.dim(`  Estimated Context: ${current.estimatedTotalTokensFormatted} tokens (${current.contextRatioFormatted})`));
      console.log(source_default.dim(`  Mapping: ${current.mappingSource ?? "unknown"} (${current.mappingConfidence ?? 0})`));
      if (current.mappingNote) {
        console.log(source_default.dim(`  Mapping Note: ${current.mappingNote}`));
      }
      console.log(source_default.dim(`  Why Heavy: ${current.whyHeavy}`));
    } else {
      console.log(source_default.dim("  No conversation data available."));
    }
    console.log();
    if (report.largestSessions.length > 0) {
      console.log(source_default.bold("Largest Sessions"));
      const largestTable = new import_cli_table32.default({
        head: [
          source_default.bold("Session"),
          source_default.bold("Workspace"),
          source_default.bold("Est.Total"),
          source_default.bold("Msgs"),
          source_default.bold("Last Active"),
          source_default.bold("Health")
        ],
        style: { head: [], border: [] },
        colWidths: [16, 26, 12, 10, 14, 10]
      });
      for (const session of report.largestSessions.slice(0, 8)) {
        largestTable.push([
          `${session.id.slice(0, 12)}...`,
          truncate2(session.workspaceName, 24),
          session.estimatedTotalTokensFormatted,
          session.messageCount !== null ? String(session.messageCount) : "unknown",
          session.lastActiveRelative,
          session.healthEmoji
        ]);
      }
      console.log(largestTable.toString());
      console.log();
    }
    console.log(source_default.bold("Unmapped Conversations"));
    if (report.unmappedConversations.length === 0) {
      console.log(source_default.dim("  No unmapped conversations detected."));
    } else {
      const unmappedTable = new import_cli_table32.default({
        head: [
          source_default.bold("Session"),
          source_default.bold("Title"),
          source_default.bold("Est.Total"),
          source_default.bold("Last Active"),
          source_default.bold("Why Unmapped")
        ],
        style: { head: [], border: [] },
        colWidths: [16, 28, 12, 14, 54]
      });
      for (const session of report.unmappedConversations) {
        unmappedTable.push([
          `${session.id.slice(0, 12)}...`,
          truncate2(session.title ?? "Untitled", 26),
          session.estimatedTotalTokensFormatted,
          session.lastActiveRelative,
          truncate2(session.mappingNote ?? "No mapping diagnosis available.", 52)
        ]);
      }
      console.log(unmappedTable.toString());
    }
    console.log();
    console.log(source_default.bold("Orphaned Artifacts"));
    if (report.orphanBrainFolders.length === 0 && report.orphanAnnotations.length === 0) {
      console.log(source_default.dim("  No orphaned brain folders or annotation files found."));
    } else {
      if (report.orphanBrainFolders.length > 0) {
        console.log(source_default.dim(`  Brain folders: ${report.orphanBrainFolders.join(", ")}`));
      }
      if (report.orphanAnnotations.length > 0) {
        console.log(source_default.dim(`  Annotation files: ${report.orphanAnnotations.join(", ")}`));
      }
    }
    console.log();
    console.log(source_default.bold("Recommended Cleanup Targets"));
    if (report.recommendedCleanupTargets.length === 0) {
      console.log(source_default.dim("  No urgent cleanup targets right now."));
    } else {
      const cleanupTable = new import_cli_table32.default({
        head: [
          source_default.bold("Session"),
          source_default.bold("Workspace"),
          source_default.bold("Est.Total"),
          source_default.bold("Why")
        ],
        style: { head: [], border: [] },
        colWidths: [16, 24, 12, 48]
      });
      for (const session of report.recommendedCleanupTargets) {
        cleanupTable.push([
          `${session.id.slice(0, 12)}...`,
          truncate2(session.workspaceName, 22),
          session.estimatedTotalTokensFormatted,
          truncate2(session.whyHeavy, 46)
        ]);
      }
      console.log(cleanupTable.toString());
    }
  });
}
function buildReport(db, config) {
  const conversations = listConversationViewModels(db, config, db.getAllConversations());
  const currentConversation = getCurrentConversationView(db, config);
  const largestSessions = [...conversations].sort((left, right) => right.estimatedTotalTokens - left.estimatedTotalTokens);
  const unmappedConversations = conversations.filter((conversation) => conversation.mappingSource === "unmapped");
  const recommendedCleanupTargets = largestSessions.filter((conversation) => conversation.contextRatio >= 0.8 || conversation.mappingSource === "unmapped").slice(0, 5);
  const pbIds = new Set;
  const conversationsDir = getConversationsDir();
  if (existsSync11(conversationsDir)) {
    for (const file of readdirSync5(conversationsDir)) {
      if (file.endsWith(".pb")) {
        pbIds.add(basename3(file, ".pb"));
      }
    }
  }
  const orphanBrainFolders = [];
  const brainDir = getBrainDir();
  if (existsSync11(brainDir)) {
    for (const entry of readdirSync5(brainDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !pbIds.has(entry.name)) {
        orphanBrainFolders.push(entry.name);
      }
    }
  }
  const orphanAnnotations = [];
  const annotationsDir = getAnnotationsDir();
  if (existsSync11(annotationsDir)) {
    for (const file of readdirSync5(annotationsDir)) {
      if (file.endsWith(".pbtxt")) {
        const id = basename3(file, ".pbtxt");
        if (!pbIds.has(id)) {
          orphanAnnotations.push(id);
        }
      }
    }
  }
  return {
    currentConversation,
    largestSessions,
    unmappedConversations,
    recommendedCleanupTargets,
    orphanBrainFolders,
    orphanAnnotations
  };
}
function truncate2(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

// src/cli/commands/nuke.ts
init_source();
init_paths();
import { rmSync, existsSync as existsSync12, statSync as statSync5, readdirSync as readdirSync6 } from "fs";
import { join as join8 } from "path";
import { createInterface } from "readline";
function registerNukeCommand(program2, db, config) {
  program2.command("nuke").description("Permanently delete conversation data for a workspace or session").option("-w, --workspace <name>", "Delete all data for a workspace").option("-c, --conversation <uuid>", "Delete a single conversation").option("--dry-run", "List files that would be deleted without actually deleting").action(async (options) => {
    if (!options.workspace && !options.conversation) {
      console.error(source_default.red("\u274C Must specify --workspace <name> or --conversation <uuid>"));
      process.exit(1);
    }
    const targets = [];
    if (options.conversation) {
      const target = buildTarget(options.conversation);
      if (target)
        targets.push(target);
      else {
        console.error(source_default.red(`\u274C Conversation ${options.conversation} not found`));
        process.exit(1);
      }
    } else if (options.workspace) {
      const workspaces = db.getAllWorkspaces();
      const ws = workspaces.find((w) => w.name.toLowerCase() === options.workspace.toLowerCase() || w.name.toLowerCase().includes(options.workspace.toLowerCase()));
      if (!ws) {
        console.error(source_default.red(`\u274C Workspace "${options.workspace}" not found`));
        process.exit(1);
      }
      const conversations = db.getConversationsByWorkspace(ws.id);
      for (const conv of conversations) {
        const target = buildTarget(conv.id);
        if (target)
          targets.push(target);
      }
    }
    if (targets.length === 0) {
      console.log(source_default.yellow("\u26A0\uFE0F  No targets found for deletion"));
      return;
    }
    const totalPbBytes = targets.reduce((s, t) => s + t.pbFileBytes, 0);
    const totalBrainBytes = targets.reduce((s, t) => s + t.brainFolderBytes, 0);
    const totalAnnotationBytes = targets.reduce((s, t) => s + t.annotationBytes, 0);
    const totalBytes = totalPbBytes + totalBrainBytes + totalAnnotationBytes;
    const pbCount = targets.filter((t) => t.pbFilePath).length;
    const brainCount = targets.filter((t) => t.brainFolderPath).length;
    const annCount = targets.filter((t) => t.annotationPath).length;
    console.log();
    console.log(source_default.bold.red("\u26A0\uFE0F  This will permanently delete:"));
    console.log(`  ${pbCount} conversation .pb file${pbCount !== 1 ? "s" : ""} (${formatBytes(totalPbBytes)})`);
    console.log(`  ${brainCount} brain folder${brainCount !== 1 ? "s" : ""} (${formatBytes(totalBrainBytes)})`);
    console.log(`  ${annCount} annotation .pbtxt file${annCount !== 1 ? "s" : ""} (${formatBytes(totalAnnotationBytes)})`);
    console.log(`  SQLite entries for ${targets.length} conversation${targets.length !== 1 ? "s" : ""}`);
    console.log();
    console.log(source_default.bold(`  Total: ${formatBytes(totalBytes)}`));
    console.log();
    if (options.dryRun) {
      console.log(source_default.yellow("\uD83C\uDFDC\uFE0F  Dry run \u2014 no files were deleted"));
      for (const target of targets) {
        console.log(source_default.dim(`  [${target.conversationId.slice(0, 12)}...]`));
        if (target.pbFilePath)
          console.log(source_default.dim(`    .pb: ${target.pbFilePath} (${formatBytes(target.pbFileBytes)})`));
        if (target.brainFolderPath)
          console.log(source_default.dim(`    brain: ${target.brainFolderPath} (${formatBytes(target.brainFolderBytes)})`));
        if (target.annotationPath)
          console.log(source_default.dim(`    ann: ${target.annotationPath} (${formatBytes(target.annotationBytes)})`));
      }
      return;
    }
    const confirmText = options.workspace || options.conversation.slice(0, 12);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve2) => {
      rl.question(source_default.yellow(`Type "${confirmText}" to confirm: `), resolve2);
    });
    rl.close();
    if (answer.trim() !== confirmText) {
      console.log(source_default.red("\u274C Confirmation failed \u2014 aborting"));
      return;
    }
    let deletedCount = 0;
    for (const target of targets) {
      try {
        if (target.pbFilePath && existsSync12(target.pbFilePath)) {
          rmSync(target.pbFilePath);
        }
        if (target.brainFolderPath && existsSync12(target.brainFolderPath)) {
          rmSync(target.brainFolderPath, { recursive: true, force: true });
        }
        if (target.annotationPath && existsSync12(target.annotationPath)) {
          rmSync(target.annotationPath);
        }
        db.deleteConversation(target.conversationId);
        deletedCount++;
      } catch (err) {
        console.error(source_default.red(`  Failed to delete ${target.conversationId}: ${err}`));
      }
    }
    if (options.workspace) {
      const ws = db.getAllWorkspaces().find((w) => w.name.toLowerCase().includes(options.workspace.toLowerCase()));
      if (ws)
        db.updateWorkspaceAggregates(ws.id);
    }
    console.log(source_default.green(`\u2705 Deleted ${deletedCount} conversations, freed ${formatBytes(totalBytes)}`));
  });
}
function buildTarget(conversationId) {
  const convDir = getConversationsDir();
  const brainDir = getBrainDir();
  const annDir = getAnnotationsDir();
  const pbFilePath = join8(convDir, `${conversationId}.pb`);
  const brainFolderPath = join8(brainDir, conversationId);
  const annotationPath = join8(annDir, `${conversationId}.pbtxt`);
  let pbFileBytes = 0;
  let brainFolderBytes = 0;
  let annotationBytes = 0;
  if (existsSync12(pbFilePath)) {
    try {
      pbFileBytes = statSync5(pbFilePath).size;
    } catch {}
  }
  if (existsSync12(brainFolderPath)) {
    brainFolderBytes = getDirSize(brainFolderPath);
  }
  if (existsSync12(annotationPath)) {
    try {
      annotationBytes = statSync5(annotationPath).size;
    } catch {}
  }
  if (pbFileBytes === 0 && brainFolderBytes === 0 && annotationBytes === 0) {
    return null;
  }
  return {
    conversationId,
    pbFilePath: existsSync12(pbFilePath) ? pbFilePath : null,
    pbFileBytes,
    brainFolderPath: existsSync12(brainFolderPath) ? brainFolderPath : null,
    brainFolderBytes,
    annotationPath: existsSync12(annotationPath) ? annotationPath : null,
    annotationBytes
  };
}
function getDirSize(dirPath) {
  let size = 0;
  try {
    const entries = readdirSync6(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join8(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += getDirSize(fullPath);
      } else {
        try {
          size += statSync5(fullPath).size;
        } catch {}
      }
    }
  } catch {}
  return size;
}

// src/server/index.ts
init_source();
function registerServeCommand(program2, db, config) {
  program2.command("serve").description("Start a JSON API server on localhost").option("-p, --port <number>", "Port to listen on", "3000").action(async (options) => {
    const port = parseInt(options.port, 10);
    console.log(source_default.dim("\uD83D\uDD0D Running initial scan..."));
    const stats = await reconcile(db, config);
    console.log(source_default.dim(`   Scanned ${stats.conversationsTotal} conversations`));
    console.log();
    Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        const path = url.pathname;
        const headers = {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        };
        if (req.method === "OPTIONS") {
          return new Response(null, { headers });
        }
        try {
          if (path === "/api/workspaces") {
            const workspaces = listWorkspaceViewModels(db, config);
            return new Response(JSON.stringify({
              currentConversation: getCurrentConversationView(db, config),
              workspaces
            }), { headers });
          }
          if (path === "/api/conversations") {
            const workspaceName = url.searchParams.get("workspace");
            const workspace = workspaceName ? db.getAllWorkspaces().find((entry) => entry.name.toLowerCase() === workspaceName.toLowerCase() || entry.name.toLowerCase().includes(workspaceName.toLowerCase())) ?? null : null;
            if (workspaceName && !workspace) {
              return new Response(JSON.stringify({ error: "Workspace not found" }), { status: 404, headers });
            }
            const conversations = listConversationViewModels(db, config, workspace ? db.getConversationsByWorkspace(workspace.id) : db.getAllConversations());
            return new Response(JSON.stringify({
              currentConversation: getCurrentConversationView(db, config),
              workspace: workspace ? buildWorkspaceViewModel(db, config, workspace) : null,
              conversations
            }), { headers });
          }
          const conversationMatch = path.match(/^\/api\/conversation\/([a-f0-9-]+)$/i);
          if (conversationMatch) {
            const conversation = db.getConversation(conversationMatch[1]);
            if (!conversation) {
              return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404, headers });
            }
            return new Response(JSON.stringify({
              conversation: buildConversationViewModel(db, config, conversation),
              snapshots: db.getSnapshotHistory(conversation.id)
            }), { headers });
          }
          if (path === "/api/health") {
            const currentConversation = getCurrentConversationView(db, config);
            const workspaces = listWorkspaceViewModels(db, config);
            const largestWorkspace = workspaces[0] ?? null;
            const unmappedCount = listConversationViewModels(db, config, db.getAllConversations()).filter((conversation) => conversation.mappingSource === "unmapped").length;
            return new Response(JSON.stringify({
              status: currentConversation.conversation && currentConversation.conversation.contextRatio >= 1 ? "degraded" : "healthy",
              currentConversation,
              topWorkspace: largestWorkspace,
              unmappedConversationCount: unmappedCount,
              bloatLimit: config.bloatLimit
            }), { headers });
          }
          return new Response(JSON.stringify({
            error: "Not found",
            availableEndpoints: [
              "GET /api/workspaces",
              "GET /api/conversations?workspace=<name>",
              "GET /api/conversation/<uuid>",
              "GET /api/health"
            ]
          }), { status: 404, headers });
        } catch (err) {
          return new Response(JSON.stringify({
            error: "Internal server error",
            message: String(err)
          }), { status: 500, headers });
        }
      }
    });
    console.log(source_default.bold.green(`\uD83D\uDE80 AG Kernel Monitor API server running on http://localhost:${port}`));
    console.log();
    console.log(source_default.dim("Available endpoints:"));
    console.log(source_default.dim(`  GET http://localhost:${port}/api/workspaces`));
    console.log(source_default.dim(`  GET http://localhost:${port}/api/conversations?workspace=<name>`));
    console.log(source_default.dim(`  GET http://localhost:${port}/api/conversation/<uuid>`));
    console.log(source_default.dim(`  GET http://localhost:${port}/api/health`));
  });
}

// src/cli/index.ts
var program2 = new Command;
function getConfigPathFromArgv(argv) {
  const flagIndex = argv.findIndex((arg) => arg === "--config");
  if (flagIndex >= 0) {
    return argv[flagIndex + 1];
  }
  const inlineArg = argv.find((arg) => arg.startsWith("--config="));
  return inlineArg ? inlineArg.slice("--config=".length) : undefined;
}
program2.name("agk").description("Deep token consumption and cache bloat monitoring for Google Antigravity sessions").version("0.1.0").option("--config <path>", "Path to .ag-kernel.json config file").option("--json", "Output raw JSON instead of formatted tables");
var config = loadConfig(getConfigPathFromArgv(process.argv));
var db = new MonitorDB(config.dbPath);
registerScanCommand(program2, db, config);
registerReportCommand(program2, db, config);
registerNukeCommand(program2, db, config);
registerServeCommand(program2, db, config);
process.on("exit", () => {
  db.close();
});
process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});
program2.parse(process.argv);
