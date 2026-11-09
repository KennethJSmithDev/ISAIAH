/// The specification is named as a string; declare its dependency so tool changes regenerate the service.
Class Isaiah.TraceMCP Extends %AI.MCP.Service [ DependsOn = Isaiah.TraceMCPTools ]
{
Parameter SPECIFICATION As STRING = "Isaiah.TraceMCPTools";
}
