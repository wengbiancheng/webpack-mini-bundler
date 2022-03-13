const fs = require("fs");
const path = require("path");
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const babel = require('@babel/core');


const moduleAnalyser = (filename) => {
    // 入口分析，通过入口拿到对应的依赖+可执行的代码code

    // 通过fs读取本地文件
    const content = fs.readFileSync(filename, "utf-8");

    // 通过babel转化content为ast
    const ast = parser.parse(content, {
        sourceType: "module"
    });

    // 通过ast拿到所有依赖的关系
    const dependencies = {};
    traverse(ast, {
        ImportDeclaration({ node }) {
            const relativePath = node.source.value;
            const dirname = path.dirname(filename);
            const absolutePath = "./" + path.join(dirname, relativePath);
            dependencies[relativePath] = absolutePath;
        }
    });

    // 通过babel拿到可执行的code
    const { code } = babel.transformFromAst(ast, null, {
        presets: ["@babel/preset-env"]
    })

    return {
        filename: filename,
        dependencies: dependencies,
        code: code
    }
}

const makeDependenciesGraph = (entry) => {
    // 首先拿到入口的依赖对象
    const entryModule = moduleAnalyser(entry);
    const graph = {};

    const graphArray = [entryModule];
    for (let i = 0; i < graphArray.length; i++) {
        // 找每一个entryModule的依赖，递归调用，形成一个对象

        const { dependencies } = graphArray[i];
        if (dependencies) {
            for (let key in dependencies) {
                graphArray.push(moduleAnalyser(dependencies[key]));
            }
        }
    }

    // 将数组的形式转化为对象
    for (let i in graphArray) {
        const { filename, dependencies, code } = graphArray[i];
        graph[filename] = {
            dependencies,
            code
        }
    }
    return graph;
}

const generateCode = (entry) => {
    // 使用闭包形成局部作用域

    // ESModule的require和exports是没有的，需要重写

    // 1. 拿到可执行的代码传入闭包
    const graph = JSON.stringify(makeDependenciesGraph(entry));

    return (
        `
    (function(graph) {

        function require(module) {

            function localRequire(relativePath) {
                return require(graph[module].dependencies[relativePath]);
            }


            var exports = {};

            (function(require, exports, code){
                eval(code);
            })(localRequire, exports, graph[module].code);

            return exports;
        }

        require('${entry}');

    })('${graph}');
    `
    )
};


const code = generateCode('./src/index.js');
console.log(code);
