import { describe,it,expect } from "vitest";
import { explanationId,validateExplanation,type ExplanationContext } from "./vote-explanation-contract";
const context:ExplanationContext={vote:{id:"v",title:"Vote on amendment"},sources:[{url:"https://www.senat.ro",label:"Vote",text:"The motion was an amendment, not final adoption."}],limited:true};
const output={ro:"Explicație despre amendamentul supus votului.",en:"An explanation of the amendment put to a vote.",evidence:[{source:0,quote:"The motion was an amendment"}]};
describe("vote explanation evidence",()=>{
  it("accepts exact quotations",()=>expect(validateExplanation(output,context)).toEqual(output));
  it("rejects fabricated quotations and sources",()=>{
    expect(()=>validateExplanation({...output,evidence:[{source:0,quote:"The bill became law"}]},context)).toThrow();
    expect(()=>validateExplanation({...output,evidence:[{source:2,quote:output.evidence[0]!.quote}]},context)).toThrow();
  });
  it("requires both translations and evidence",()=>{
    expect(()=>validateExplanation({...output,en:""},context)).toThrow();
    expect(()=>validateExplanation({...output,evidence:[]},context)).toThrow();
  });
  it("invalidates cached approval when the motion or source text changes",()=>{
    expect(explanationId("v",context)).toBe(explanationId("v",structuredClone(context)));
    expect(explanationId("v",context)).not.toBe(explanationId("v",{...context,vote:{id:"v",title:"Final adoption"}}));
    expect(explanationId("v",context)).not.toBe(explanationId("v",{...context,sources:[{...context.sources[0]!,text:"Corrected official text"}]}));
  });
});
