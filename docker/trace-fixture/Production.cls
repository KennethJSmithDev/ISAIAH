Class DevTrace.Production Extends Ens.Production
{
XData ProductionDefinition
{
<Production Name="DevTrace.Production" TestingEnabled="false" LogGeneralTraceEvents="false">
  <Description>Independent synthetic production for standalone trace qualification.</Description>
  <ActorPoolSize>2</ActorPoolSize>
  <Item Name="Fixture Intake" ClassName="DevTrace.Intake" PoolSize="0" Enabled="true"/>
  <Item Name="Fixture Sink" ClassName="DevTrace.Sink" PoolSize="1" Enabled="true"/>
</Production>
}
}
