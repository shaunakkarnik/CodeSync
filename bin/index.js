#!/usr/bin/env node

// Handle punycode warning

// At the top of your index.js file

import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';
import chalk from 'chalk';
import figlet from 'figlet';
import boxen from 'boxen';
import ora from 'ora';
import readline from 'readline';


// Create __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

function loadDeprecatedFunctions() {
  const dbPath = path.resolve(__dirname, '../deprecated_functions.json');
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.warn(chalk.yellow('Warning: Could not load deprecated functions database. Using built-in fallback.'));
    return [
      { 
        "deprecated": "foregroundColor(_:)", 
        "replacement": "foregroundStyle(_:)",
        "description": "Use foregroundStyle(_:) instead"
      },
      { 
        "deprecated": "edgesIgnoringSafeArea(_:)", 
        "replacement": "ignoresSafeArea(_:edges:)",
        "description": "Use ignoresSafeArea(_:edges:) instead"
      }
    ];
  }
}

function findRelevantDeprecations(code, allDeprecations) {
  return allDeprecations.filter(item => {
    // Skip entries without proper deprecated field
    if (!item.deprecated) return false;
    
    // Extract just the base modifier name without parameters
    let functionName = item.deprecated;
    
    // Handle variations: "func name(...)", "name(...)", or just "name"
    if (functionName.startsWith("func ")) {
      functionName = functionName.substring(5).trim();
    }
    
    // Remove any parameter details
    functionName = functionName.split("(")[0].trim();
    
    // Check if the code contains this function name
    // Use regex to find the function name as a modifier (with a dot before it)
    const modifierPattern = new RegExp(`\\.${functionName}\\s*\\(`);
    return modifierPattern.test(code) || code.includes(`.${functionName}`);
  });
}

const argv = yargs(hideBin(process.argv))
  .usage(chalk.green('Usage: $0 [options] <filename>'))
  .option('a', {
    alias: 'analyze',
    describe: 'Analyze Swift code in file',
    type: 'string',
    demandOption: false
  })
  .option('s', {
    alias: 'summarize',
    describe: 'Summarize file contents',
    type: 'string',
    demandOption: false
  })
  .option('r', {
    alias: 'read',
    describe: 'Read and display file contents',
    type: 'string',
    demandOption: false
  }).option('restore', {
    alias: 'rst',
    describe: 'Restore file from backup (.bak)',
    type: 'string',
    demandOption: false
  })
  .check((argv) => {
    if (!argv.s && !argv.r && !argv.a && !argv.restore) {
      throw new Error(chalk.red('You must provide either --analyze (-a), --summarize (-s), --read (-r), or --restore option'));
    }
    return true;
  })
  .help()
  .parse();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

if (argv.a) {
  if (!OPENAI_API_KEY) {
    console.error('Error: Missing OpenAI API key. Set OPENAI_API_KEY in your .env file.');
    process.exit(1);
  }

  const filePath = path.resolve(argv.a);


  fs.readFile(filePath, 'utf8', async (err, data) => {
    if (err) {
      console.error(`Error reading file: ${err.message}`);
      process.exit(1);
    }

    console.log(`Analyzing contents of ${filePath}...`);

    try {
      // Load deprecated functions database
      const allDeprecations = loadDeprecatedFunctions();
      
      // Find relevant deprecations for this code
      const relevantDeprecations = findRelevantDeprecations(data, allDeprecations);
      
      // Show what's being checked
      const spinner = ora('Finding deprecated Swift elements...').start();
      
      // Build context string from relevant deprecations
      const deprecationContext = relevantDeprecations
        .map(item => {
          // Clean up the function name for better readability
          let funcName = item.deprecated || "";
          // Remove 'func ' prefix if it exists
          if (funcName.startsWith("func ")) {
            funcName = funcName.substring(5);
          }
          // Return the deprecated function name and its description
          return `${funcName}: ${item.description}`;
        })
        .join('\n');
      
      // If no relevant deprecations found, add a note
      const contextMessage = relevantDeprecations.length > 0 
        ? `\n\nHere is some context: \n${deprecationContext}`
        : "\n\nNo specific deprecations were detected, but check for any unexpected behavior.";

      // Handle punycode warning as before
      const originalEmitWarning = process.emitWarning;
      process.emitWarning = function(warning, ...args) {
        if (typeof warning === 'string' && warning.includes('punycode')) {
          return;
        }
        return originalEmitWarning.call(process, warning, ...args);
      };

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            "role": "system",
            "content": [
              {
                "type": "text",
                "text": "You are an assistant to an iOS developer helping identify and fix ALL deprecated Swift modifiers. For each deprecated element you find:\n\n1. Show ONLY the deprecated code with 1-2 lines of context before and after\n2. If a deprecated element is part of a small view (less than 6 lines total), show the entire view including the declaration line\n3. Include line numbers but they don't need to be contiguous if deprecated elements are far apart\n4. DO NOT output large sections of code without deprecated elements\n5. Add a comment '// Deprecated' at the end of each line with a deprecated element\n6. Include ALL deprecated elements in the file - be thorough and don't miss any\n\nAfter listing all deprecated elements, provide a bulleted list of replacements.\n\nHere is context about deprecated functions:" + contextMessage
              }
            ]
          },
          {
            "role": "user",
            "content": [
              {
                "type": "text",
                "text": "import SwiftUI\n\nstruct NavigationExample: View {\n    var body: some View {\n        NavigationView {\n            VStack {\n                Image(systemName: \"star\")\n                    .accentColor(.yellow)\n                    .padding()\n                // Many lines of code here\n                // ...\n                // ...\n                Text(\"Hello\")\n                    .foregroundColor(.blue)\n                    .font(.title)\n            }\n            .navigationBarTitle(\"My App\")\n        }\n        .edgesIgnoringSafeArea(.bottom)\n    }\n}"
              }
            ]
          },
          {
            "role": "assistant",
            "content": [
              {
                "type": "text",
                "text": "7|                Image(systemName: \"star\")\n8|                    .accentColor(.yellow) // Deprecated\n9|                    .padding()\n\n14|                Text(\"Hello\")\n15|                    .foregroundColor(.blue) // Deprecated\n16|                    .font(.title)\n\n17|            }\n18|            .navigationBarTitle(\"My App\") // Deprecated\n19|        }\n\n19|        }\n20|        .edgesIgnoringSafeArea(.bottom) // Deprecated\n21|    }\n\nReplacements:\n- Use tint(_:) instead of accentColor(_:)\n- Use foregroundStyle(_:) instead of foregroundColor(_:)\n- Use navigationTitle(_:) instead of navigationBarTitle(_:)\n- Use ignoresSafeArea(_:edges:) instead of edgesIgnoringSafeArea(_:)"
              }
            ]
          },
          {
            "role": "user",
            "content": [
              {
                "type": "text",
                "text": "import SwiftUI\n\nstruct SimpleView: View {\n    var body: some View {\n        VStack {\n            Image(systemName: \"star\")\n                .accentColor(.yellow)\n                .padding()\n            Text(\"Hello\")\n                .foregroundColor(.blue)\n        }\n        .frame(width: 100)\n    }\n}"
              }
            ]
          },
          {
            "role": "assistant",
            "content": [
              {
                "type": "text",
                "text": "6|            Image(systemName: \"star\")\n7|                .accentColor(.yellow) // Deprecated\n8|                .padding()\n9|            Text(\"Hello\")\n10|                .foregroundColor(.blue) // Deprecated\n\nReplacements:\n- Use tint(_:) instead of accentColor(_:)\n- Use foregroundStyle(_:) instead of foregroundColor(_:)"
              }
            ]
          },
          {
            "role": "user",
            "content": [
              {
                "type": "text",
                "text": "import SwiftUI\n\nstruct ComplexView: View {\n    var body: some View {\n        NavigationView {\n            List {\n                HStack {\n                    Image(systemName: \"star\")\n                        .accentColor(.yellow)\n                    Text(\"Item 1\")\n                }\n                \n                // Many lines of non-deprecated code\n                // ...\n                // ...\n                \n                VStack {\n                    Rectangle()\n                        .cornerRadius(10, antialiased: true)\n                        .foregroundColor(.blue)\n                }\n            }\n            .navigationBarItems(trailing: Button(\"Edit\") {})\n        }\n    }\n}"
              }
            ]
          },
          {
            "role": "assistant",
            "content": [
              {
                "type": "text",
                "text": "8|                    Image(systemName: \"star\")\n9|                        .accentColor(.yellow) // Deprecated\n10|                    Text(\"Item 1\")\n\n18|                    Rectangle()\n19|                        .cornerRadius(10, antialiased: true) // Deprecated\n20|                        .foregroundColor(.blue) // Deprecated\n21|                }\n\n23|            .navigationBarItems(trailing: Button(\"Edit\") {}) // Deprecated\n24|        }\n\nReplacements:\n- Use tint(_:) instead of accentColor(_:)\n- Use clipShape(RoundedRectangle(cornerRadius:), style:) instead of cornerRadius(_:antialiased:)\n- Use foregroundStyle(_:) instead of foregroundColor(_:)\n- Use toolbar { ToolbarItem(placement: .navigationBarTrailing) { ... } } instead of navigationBarItems(trailing:)"
              }
            ]
          },
          {
            "role": "user",
            "content": data
          },
        ],
        response_format: {
          "type": "text"
        },
        temperature: 0.3,
        max_completion_tokens: 2048,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      });

      spinner.succeed('Analysis complete');

      const analysisResult = completion.choices[0].message.content;

      const colorizedResult = analysisResult.split('\n').map(line => {

      if (line.toLowerCase().includes('deprecated')) {
        return chalk.red(line);
      }
      return line;
      }).join('\n');

      console.log(boxen(colorizedResult, {
        padding: 1,
        margin: 1,
        borderColor: 'whiteBright',
        borderStyle: 'round'
      }));
      
      // Prompt user to accept changes
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question(chalk.yellow('\nDo you want to accept the changes? (yes/no): '), async (answer) => {
        if (answer.toLowerCase() === 'yes') {
          console.log(chalk.yellow('\nApplying changes...'));

          // Make another API call to get the fixed code
          const fixCompletion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                "role": "system",
                "content": [
                  {
                    "type": "text",
                    "text": "You are an assistant that fixes deprecated Swift code. Given a Swift file that has deprecated elements, as well as how to fix it, provide the complete fixed file with all deprecated elements replaced with their current equivalents. Return ONLY the complete fixed code with no explanations. Do not include ANYTHING else. You sometimes include '''swift at the top of the file and ''' at the bottom. DO NOT INCLUDE THIS. Your output will be the exact new file, nothing else."
                  }
                ]
              },
              {
                "role": "user",
                "content": [
                  {
                    "type": "text",
                    "text": "import SwiftUI\n\nstruct ContentView: View {\n\n    var body: some View {\n        VStack {\n            Rectangle()\n                .foregroundColor(Color.blue)\n                .frame(width: 100, height: 100)\n        }\n    }\n}"
                  }
                ]
              },
              {
                "role": "assistant",
                "content": [
                  {
                    "type": "text",
                    "text": "\nRectangle()\n    .foregroundColor(Color.blue) // Deprecated line\n    .frame(width: 100, height: 100\n\nUse `foregroundStyle(_:)` instead of `foregroundColor(_)`."
                  }
                ]
              },
              {
                "role": "assistant",
                "content": [
                  {
                    "type": "text",
                    "text": "import SwiftUI\n\nstruct ContentView: View {\n\n    var body: some View {\n        VStack {\n            Rectangle()\n                .foregroundStyle(Color.blue)\n                .frame(width: 100, height: 100)\n        }\n    }\n}"
                  }
                ]
              },
              {
                "role": "user",
                "content": [
                  {
                    "type": "text",
                    "text": data
                  }
                ]
              },
              {
                "role": "assistant",
                "content": [
                  {
                    "type": "text",
                    "text": analysisResult
                  }
                ]
              }
            ],
            response_format: {
              "type": "text"
            },
            temperature: 0.2,
            max_tokens: 4096
          });

          const fixedCode = fixCompletion.choices[0].message.content;

          // Create a backup of the original file
          const backupPath = `${filePath}.bak`;
          fs.writeFileSync(backupPath, data);
          console.log(chalk.blue(`Original file backed up to ${backupPath}`));

          // Write the fixed code to the original file
          fs.writeFileSync(filePath, fixedCode);
          console.log(chalk.green('Changes applied successfully!'));
        } else {
          console.log(chalk.gray('Changes discarded.'));
        }
        rl.close();
      });

    } catch (error) {
      console.error(`Error analyzing file: ${error.message}`);
    }
  });
} else if (argv.s) {
  if (!OPENAI_API_KEY) {
    console.error('Error: Missing OpenAI API key. Set OPENAI_API_KEY in your .env file.');
    process.exit(1);
  }

  const filePath = path.resolve(argv.s);

  fs.readFile(filePath, 'utf8', async (err, data) => {
    if (err) {
      console.error(`Error reading file: ${err.message}`);
      process.exit(1);
    }

    console.log(`Summarizing contents of ${filePath}...`);

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: `Summarize the following text:\n\n${data}`
          }
        ],
        max_tokens: 100
      });

      console.log('Summary:', completion.choices[0].message.content);
    } catch (error) {
      console.error(`Error summarizing file: ${error.message}`);
    }
  });
} else if (argv.r) {
  const filePath = path.resolve(argv.r);

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error(`Error reading file: ${err.message}`);
      process.exit(1);
    }

    console.log(`Contents of ${filePath}:\n`);
    console.log(data);
  });
} else if (argv.restore) {
  const filePath = path.resolve(argv.restore);
  const backupPath = `${filePath}.bak`;
  
  // Check if backup exists
  if (fs.existsSync(backupPath)) {
    try {
      // Read backup file
      const backupData = fs.readFileSync(backupPath, 'utf8');
      
      // Write backup data to original file
      fs.writeFileSync(filePath, backupData);
      
      // Delete the backup file after successful restoration
      fs.unlinkSync(backupPath);
      
      console.log(chalk.green(`✅ Successfully restored ${filePath} from backup`));
      console.log(chalk.gray(`Backup file ${backupPath} has been deleted`));
    } catch (err) {
      console.error(chalk.red(`Error during restore operation: ${err.message}`));
    }
  } else {
    console.error(chalk.red(`No backup file found at ${backupPath}`));
  }
}